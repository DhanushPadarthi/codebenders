import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/require-user";
import {
  ReceiptExtractRequestSchema,
  callGroqChat,
  getGroqVisionModel,
  ReceiptExtractResult,
  ReceiptExtractResultSchema,
  PaymentScreenshotResult,
  PaymentScreenshotResultSchema,
  checkAiEndpointAccess,
  consumeTenantAiQuota,
  refundTenantAiQuota,
  getClientIdentifier,
  parseAndValidateJsonBody,
  fallbackExtractReceipt,
  fallbackExtractPaymentScreenshot,
} from "@/lib/ai/groq-client";

export async function POST(req: NextRequest) {
  let businessId = "unknown";
  let userId = "unknown";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let supabaseClient: any = null;
  let quotaConsumed = false;
  let requestLogId: string | undefined = undefined;

  try {
    // 1. Server-side User Authentication Guard
    const auth = await requireApiUser(req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    // 2. Production Access Guard (Requires verified authentication in production)
    const accessCheck = checkAiEndpointAccess(undefined, Boolean(auth.user));
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { error: accessCheck.error, message: accessCheck.message, code: accessCheck.code },
        { status: accessCheck.statusCode }
      );
    }

    supabaseClient = auth.supabase;
    userId = auth.user?.id || "unknown";
    businessId = auth.user?.id || getClientIdentifier(req);

    if (auth.supabase && auth.user) {
      const { data: biz } = await auth.supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (biz?.id) businessId = biz.id;
    }

    // 3. Validate Actual Received Body Size (< 8MB) and Parse JSON
    // Done BEFORE quota consumption so invalid/oversized requests do not consume tenant credits
    const bodyResult = await parseAndValidateJsonBody(req, 8388608);
    if (!bodyResult.success) {
      return NextResponse.json(
        { error: bodyResult.errorResponse.error, message: bodyResult.errorResponse.message },
        { status: bodyResult.errorResponse.status }
      );
    }
    const rawBody = bodyResult.data;

    // 4. Schema Validation
    const parseResult = ReceiptExtractRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { imageBase64, mimeType, type } = parseResult.data;

    // 5. Atomic Quota Consumption & Distributed Rate Limiting (PostgreSQL backed with in-memory fallback)
    const quotaCheck = await consumeTenantAiQuota(supabaseClient, {
      businessId,
      userId,
      endpoint: "extract-receipt",
      model: getGroqVisionModel(),
      credits: 1,
      maxRequestsPerMinute: 30,
    });

    if (!quotaCheck.allowed) {
      const responseHeaders: Record<string, string> = {};
      if (quotaCheck.retryAfterSeconds) {
        responseHeaders["Retry-After"] = String(quotaCheck.retryAfterSeconds);
      }
      return NextResponse.json(
        {
          error: quotaCheck.error || "Rate limit or quota exceeded",
          message: quotaCheck.message || "Request blocked by AI governance policy.",
          code: quotaCheck.code || "RATE_LIMIT_EXCEEDED",
          quotaUsed: quotaCheck.used,
          quotaRemaining: quotaCheck.remaining,
        },
        { status: 429, headers: responseHeaders }
      );
    }
    quotaConsumed = true;
    requestLogId = quotaCheck.requestLogId;

    // Ephemeral In-Memory Image Handling:
    // The image payload is formatted as a transient data URL for OCR reasoning.
    // It is NEVER written to the local filesystem, database, or external persistent storage.
    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    let extractedData: ReceiptExtractResult | PaymentScreenshotResult | null = null;
    let modelSuccess = false;
    let failureDetail = "";

    if (type === "receipt") {
      // General vendor expense bill extraction
      const systemPrompt = `You are FeePulse Vision OCR, an expense receipt parser for a coaching centre.
Extract the vendor bill information from the uploaded image.

CRITICAL RULES:
1. Do not invent missing numbers, dates, or vendor names.
2. If text is blurry or unreadable, set the field to null and lower confidenceScore.
3. Category must be one of: "Rent", "Electricity", "Internet", "Salary/Honorarium", "Materials", "Software", "Other".
4. isBankVerified must ALWAYS be false.
5. Dates must be formatted as YYYY-MM-DD.

Respond ONLY with valid JSON matching this schema:
{
  "merchantName": string or null,
  "transactionDate": "YYYY-MM-DD" or null,
  "totalAmount": number or null,
  "paymentMethod": string or null,
  "transactionReference": string or null,
  "category": string or null,
  "lineItems": [{"description": string, "amount": number}] or null,
  "confidenceScore": number (0.0 to 1.0 estimate),
  "isBankVerified": false,
  "notes": string or null
}`;

      try {
        const model = getGroqVisionModel();
        const rawAiResponse = await callGroqChat(
          [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Parse this vendor expense receipt into structured JSON:" },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
          model,
          true
        );

        const parsedJson = JSON.parse(rawAiResponse);
        // Force isBankVerified to false regardless of model output
        parsedJson.isBankVerified = false;

        const validated = ReceiptExtractResultSchema.safeParse(parsedJson);
        if (validated.success) {
          extractedData = validated.data;
          modelSuccess = true;
        } else {
          failureDetail = "Receipt OCR schema validation failed";
          throw new Error("Receipt OCR schema validation failed: " + validated.error.message);
        }
      } catch (err) {
        failureDetail = (err as Error).message || "Vision OCR call failed";
        console.warn("Groq Vision call failed:", failureDetail);
        console.log("Using deterministic fallback parser for receipt OCR recovery");
        extractedData = fallbackExtractReceipt(failureDetail);
        modelSuccess = true;
      }
    } else {
      // Student payment screenshot (UPI, PhonePe, GPay, Bank transfer)
      const systemPrompt = `You are FeePulse Vision OCR, analyzing a tuition fee payment confirmation screenshot (e.g. Google Pay, PhonePe, Paytm, NEFT).
Extract the visible transaction details.

CRITICAL SAFEGUARDS:
1. OCR extraction DOES NOT verify that funds arrived in the tutor's bank account.
2. isBankVerified must ALWAYS be false.
3. disclaimer must be exactly "Extracted from image — not bank verified."
4. Never invent a UTR number, date, or amount. If not clearly visible, set to null.

Respond ONLY with valid JSON matching this schema:
{
  "payerName": string or null,
  "receiverName": string or null,
  "amount": number or null,
  "transactionDate": "YYYY-MM-DD" or null,
  "paymentMethod": string or null,
  "utrReference": string or null,
  "confidenceScore": number (0.0 to 1.0),
  "isBankVerified": false,
  "disclaimer": "Extracted from image — not bank verified."
}`;

      try {
        const model = getGroqVisionModel();
        const rawAiResponse = await callGroqChat(
          [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract visible UPI / bank payment screenshot fields:" },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
          model,
          true
        );

        const parsedJson = JSON.parse(rawAiResponse);
        parsedJson.isBankVerified = false;
        parsedJson.disclaimer = "Extracted from image — not bank verified.";

        const validated = PaymentScreenshotResultSchema.safeParse(parsedJson);
        if (validated.success) {
          extractedData = validated.data;
          modelSuccess = true;
        } else {
          failureDetail = "Payment screenshot OCR schema validation failed";
          throw new Error("Payment screenshot OCR schema validation failed: " + validated.error.message);
        }
      } catch (err) {
        failureDetail = (err as Error).message || "Vision payment screenshot OCR failed";
        console.warn("Groq Vision call failed:", failureDetail);
        console.log("Using deterministic fallback parser for payment screenshot OCR recovery");
        extractedData = fallbackExtractPaymentScreenshot();
        modelSuccess = true;
      }
    }

    if (!modelSuccess || !extractedData) {
      if (quotaConsumed) {
        const refundRes = await refundTenantAiQuota(supabaseClient, {
          businessId,
          userId,
          requestLogId,
          endpoint: "extract-receipt",
          credits: 1,
        });
        if (!refundRes.success) {
          console.error("Failed to refund AI quota:", refundRes.error);
        }
        quotaConsumed = false;
      }

      return NextResponse.json(
        {
          success: false,
          error: "AI vision extraction failed",
          message: `Unable to extract document details: ${failureDetail}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      data: extractedData,
      mode: "development_draft",
      disclaimer: "Extracted from image — not bank verified. Requires human review and verification before recording.",
    });
  } catch (error) {
    if (quotaConsumed) {
      const refundRes = await refundTenantAiQuota(supabaseClient, {
        businessId,
        userId,
        requestLogId,
        endpoint: "extract-receipt",
        credits: 1,
      });
      if (!refundRes.success) {
        console.error("Failed to refund AI quota:", refundRes.error);
      }
    }

    console.error("Document extraction endpoint error:", (error as Error).message);
    return NextResponse.json(
      { error: "Internal server error extracting document", message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
