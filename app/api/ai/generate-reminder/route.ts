import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/require-user";
import {
  ReminderGenerateRequestSchema,
  callGroqChat,
  getGroqTextModel,
  ReminderGenerateResult,
  checkAiEndpointAccess,
  consumeTenantAiQuota,
  refundTenantAiQuota,
  getClientIdentifier,
  parseAndValidateJsonBody,
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

    let businessName = "Coaching Academy";
    let tutorName = "Tutor";

    if (auth.supabase && auth.user) {
      const [bizRes, profileRes] = await Promise.all([
        auth.supabase
          .from("businesses")
          .select("id, name")
          .eq("owner_id", auth.user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        auth.supabase
          .from("profiles")
          .select("full_name")
          .eq("id", auth.user.id)
          .maybeSingle(),
      ]);

      if (bizRes.data?.id) {
        businessId = bizRes.data.id;
      }
      if (bizRes.data?.name) {
        businessName = bizRes.data.name;
      }
      if (profileRes.data?.full_name) {
        tutorName = profileRes.data.full_name;
      }
    }

    // 3. Validate Actual Received Body Size (< 64KB) and Parse JSON
    // Done BEFORE quota consumption so invalid/oversized requests do not consume tenant credits
    const bodyResult = await parseAndValidateJsonBody(req, 65536);
    if (!bodyResult.success) {
      return NextResponse.json(
        { error: bodyResult.errorResponse.error, message: bodyResult.errorResponse.message },
        { status: bodyResult.errorResponse.status }
      );
    }
    const rawBody = bodyResult.data;

    // 4. Schema Validation
    const parseResult = ReminderGenerateRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const {
      parentName,
      studentName,
      outstandingBalance,
      invoiceNumbers,
      overdueDays,
      promiseStatus,
      tone,
      businessPaymentDetails,
    } = parseResult.data;

    // 5. Atomic Quota Consumption & Distributed Rate Limiting (PostgreSQL backed with in-memory fallback)
    const quotaCheck = await consumeTenantAiQuota(supabaseClient, {
      businessId,
      userId,
      endpoint: "generate-reminder",
      model: getGroqTextModel(),
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

    let paymentInfo = businessPaymentDetails?.trim();
    if (!paymentInfo && auth.supabase && businessId) {
      const { data: setRes } = await auth.supabase
        .from("business_settings")
        .select("upi_id")
        .eq("business_id", businessId)
        .maybeSingle();

      if (setRes?.upi_id) {
        paymentInfo = `UPI (${setRes.upi_id}) or centre reception`;
      }
    }

    if (!paymentInfo) {
      paymentInfo = "UPI or at coaching centre reception";
    }

    const invoicesText = invoiceNumbers.length > 0 ? invoiceNumbers.join(", ") : "pending fee invoice";
    const formattedAmount = `₹${outstandingBalance.toLocaleString("en-IN")}`;

    const systemPrompt = `You are FeePulse AI Copilot for ${businessName} (led by ${tutorName}).
Generate an effective, respectful WhatsApp tuition fee reminder for an Indian coaching centre.

TONE INSTRUCTIONS:
- "friendly": Warm, encouraging, polite reminder for mild delays (1-5 days).
- "polite": Professional, courteous, objective reminder for moderate delays (6-12 days).
- "firm": Direct, assertive, urgent reminder referencing broken promises or extended delays (13+ days). Maintain high respect.

CRITICAL FINANCIAL INTEGRITY SAFEGUARDS:
1. Use ONLY the given parent name (${parentName}) and student name (${studentName}).
2. Do NOT fabricate, invent, or guess bank accounts, IFSC codes, or fictional UPI handles.
3. Include payment details ONLY as specified: "${paymentInfo}".
4. Keep message suitable for WhatsApp (150-250 words max).
5. Do NOT claim the message was already delivered or verified.
6. WhatsApp delivery is always manual via tutor action. No automated messages are dispatched.`;

    const userPrompt = `Generate a ${tone.toUpperCase()} tone payment reminder:
- Parent: ${parentName}
- Student: ${studentName}
- Outstanding Amount: ${formattedAmount}
- Invoices: ${invoicesText}
- Days Overdue: ${overdueDays}
${promiseStatus ? `- Promise Context: ${promiseStatus}` : ""}`;

    let generatedMessage = "";
    let modelSuccess = false;
    let failureDetail = "";

    try {
      const model = getGroqTextModel();
      const aiResponse = await callGroqChat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model,
        false
      );
      generatedMessage = aiResponse.trim();
      if (generatedMessage.length > 0) {
        modelSuccess = true;
      } else {
        failureDetail = "Model returned empty response";
      }
    } catch (err) {
      failureDetail = (err as Error).message || "Groq text model invocation failed";
      console.warn("Groq text model call failed:", failureDetail);
    }

    if (!modelSuccess || !generatedMessage) {
      if (quotaConsumed) {
        const refundRes = await refundTenantAiQuota(supabaseClient, {
          businessId,
          userId,
          requestLogId,
          endpoint: "generate-reminder",
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
          error: "AI model operation failed",
          message: `Unable to generate payment reminder: ${failureDetail}`,
        },
        { status: 502 }
      );
    }

    const result: ReminderGenerateResult = {
      message: generatedMessage,
      tone,
      characterCount: generatedMessage.length,
    };

    return NextResponse.json({
      success: true,
      data: result,
      mode: "development_draft",
    });
  } catch (error) {
    if (quotaConsumed) {
      const refundRes = await refundTenantAiQuota(supabaseClient, {
        businessId,
        userId,
        requestLogId,
        endpoint: "generate-reminder",
        credits: 1,
      });
      if (!refundRes.success) {
        console.error("Failed to refund AI quota:", refundRes.error);
      }
    }

    console.error("Reminder generation endpoint error:", (error as Error).message);
    return NextResponse.json(
      { error: "Internal server error generating reminder", message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
