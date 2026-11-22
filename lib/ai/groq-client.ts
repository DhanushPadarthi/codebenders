/**
 * Groq AI Client & Structured Extraction Schemas
 * 
 * Interacts with Groq Cloud API for:
 * - Text Reasoning (openai/gpt-oss-120b): Payment promise parsing & reminder generation
 * - Vision OCR (qwen/qwen3.8-27b): Receipt and UPI payment confirmation scanning
 * 
 * Strict Zod validation on inputs and outputs.
 * Zero-trust prompt injection hardening.
 * Mandatory bank-verification disclaimers on OCR screenshots.
 */

import { z } from "zod";

// ============================================================================
// 1. Zod Schemas
// ============================================================================

export const coerceNumberOrNull = z.preprocess((val) => {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  if (typeof val === "string") {
    const cleaned = val.replace(/[^0-9.-]/g, "");
    if (!cleaned) return null;
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}, z.number().nullable().optional());

export const coerceConfidenceScore = z.preprocess((val) => {
  if (typeof val === "number") {
    if (isNaN(val)) return 0.5;
    if (val > 1 && val <= 100) return Math.round((val / 100) * 100) / 100;
    return Math.max(0, Math.min(1, Math.round(val * 100) / 100));
  }
  if (typeof val === "string") {
    const cleaned = val.replace(/[^0-9.-]/g, "");
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed)) {
      if (parsed > 1 && parsed <= 100) return Math.round((parsed / 100) * 100) / 100;
      return Math.max(0, Math.min(1, Math.round(parsed * 100) / 100));
    }
  }
  return 0.5;
}, z.number().min(0).max(1));

export const PaymentPromiseParseRequestSchema = z.object({
  messageText: z.string().min(1, "Message text is required").max(2000, "Message text exceeds maximum length of 2000 characters"),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Reference date must be YYYY-MM-DD").optional(),
});

export type PaymentPromiseParseRequest = z.infer<typeof PaymentPromiseParseRequestSchema>;

export const PaymentPromiseResultSchema = z.object({
  parentName: z.string().nullable().optional(),
  studentName: z.string().nullable().optional(),
  promisedAmount: coerceNumberOrNull,
  promisedDate: z.string().nullable().optional(), // YYYY-MM-DD
  paymentMethod: z.string().nullable().optional(),
  invoiceReference: z.string().nullable().optional(),
  summary: z.string(),
  confidenceScore: coerceConfidenceScore,
  needsClarification: z.preprocess((val) => typeof val === "boolean" ? val : Boolean(val), z.boolean()),
  clarificationReason: z.string().nullable().optional(),
});

export type PaymentPromiseResult = z.infer<typeof PaymentPromiseResultSchema>;

export const ReceiptExtractRequestSchema = z.object({
  imageBase64: z
    .string()
    .min(10, "Image base64 payload is required")
    .max(7000000, "Image exceeds maximum allowed size (5MB)")
    .refine(
      (val) => /^[A-Za-z0-9+/=]+$/.test(val.replace(/\s+/g, "")),
      "Invalid base64 encoding in image payload"
    ),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"], {
    message: "Only JPEG, PNG, and WebP images are supported",
  }),
  type: z.enum(["receipt", "payment_screenshot"]).default("receipt"),
});

export type ReceiptExtractRequest = z.infer<typeof ReceiptExtractRequestSchema>;

export const ReceiptExtractResultSchema = z.object({
  merchantName: z.string().nullable().optional(),
  transactionDate: z.string().nullable().optional(), // YYYY-MM-DD
  totalAmount: coerceNumberOrNull,
  paymentMethod: z.string().nullable().optional(),
  transactionReference: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  lineItems: z.array(z.object({
    description: z.string(),
    amount: coerceNumberOrNull,
  })).nullable().optional(),
  confidenceScore: coerceConfidenceScore, // Estimated confidence score (0.0 to 1.0)
  isBankVerified: z.literal(false), // ALWAYS FALSE: OCR cannot verify bank ledger settlement
  notes: z.string().nullable().optional(),
});

export type ReceiptExtractResult = z.infer<typeof ReceiptExtractResultSchema>;

export const PaymentScreenshotResultSchema = z.object({
  payerName: z.string().nullable().optional(),
  receiverName: z.string().nullable().optional(),
  amount: coerceNumberOrNull,
  transactionDate: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  utrReference: z.string().nullable().optional(),
  confidenceScore: coerceConfidenceScore, // Estimated confidence score (0.0 to 1.0)
  isBankVerified: z.literal(false), // ALWAYS FALSE: OCR cannot verify bank ledger settlement
  disclaimer: z.string().default("Extracted from image — not bank verified."),
});

export type PaymentScreenshotResult = z.infer<typeof PaymentScreenshotResultSchema>;

export const ReminderGenerateRequestSchema = z.object({
  parentName: z.string().min(1, "Parent name is required").max(100, "Parent name exceeds limit"),
  studentName: z.string().min(1, "Student name is required").max(100, "Student name exceeds limit"),
  outstandingBalance: z.number().min(0, "Balance must be non-negative").max(100000000, "Balance exceeds limit"),
  invoiceNumbers: z.array(z.string().max(50)).max(20).default([]),
  overdueDays: z.number().int().min(0).max(3650).default(0),
  promiseStatus: z.string().max(50).optional(),
  previousFollowUpOutcome: z.string().max(100).optional(),
  tone: z.enum(["friendly", "polite", "firm"]).default("polite"),
  businessPaymentDetails: z.string().max(200).optional(),
});

export type ReminderGenerateRequest = z.infer<typeof ReminderGenerateRequestSchema>;

export const ReminderGenerateResultSchema = z.object({
  message: z.string().min(1),
  tone: z.enum(["friendly", "polite", "firm"]),
  characterCount: z.number(),
});

export type ReminderGenerateResult = z.infer<typeof ReminderGenerateResultSchema>;

// ============================================================================
// 2. Security, Rate Limiting & Production Access Guards
// ============================================================================

/**
 * Verifies whether AI endpoints are permitted in the current runtime environment.
 * 
 * STRICT PRODUCTION IMMUTABILITY RULE:
 * In production (NODE_ENV === "production"), unauthenticated AI endpoints are
 * unconditionally BLOCKED with HTTP 403 Forbidden.
 * 
 * Under NO circumstances can ENABLE_PRODUCTION_AI or any other environment variable
 * override this block to expose unauthenticated AI routes in production.
 * AI endpoints will remain strictly blocked in production until verified Supabase user
 * authentication and tenant authorization are implemented.
 * 
 * In development and test environments (NODE_ENV !== "production"): AI endpoints are enabled.
 */
export function checkAiEndpointAccess(
  customEnv?: {
    NODE_ENV?: string;
    ENABLE_PRODUCTION_AI?: string;
  },
  isAuthenticated = false
): {
  allowed: boolean;
  statusCode: number;
  error?: string;
  message?: string;
  code?: string;
} {
  const nodeEnv = customEnv?.NODE_ENV ?? process.env.NODE_ENV;
  const isProduction = nodeEnv === "production";

  // In production, unauthenticated AI requests are strictly blocked with 403 Forbidden.
  // When verified Supabase user authentication is established (isAuthenticated === true),
  // authenticated tenant AI requests are permitted.
  if (isProduction && !isAuthenticated) {
    return {
      allowed: false,
      statusCode: 403,
      error: "AI endpoints disabled in production",
      message:
        "AI endpoints are strictly disabled in production mode until verified Supabase user authentication and tenant authorization are implemented. Environment overrides are prohibited for unauthenticated endpoints.",
      code: "AI_PRODUCTION_DISABLED",
    };
  }

  return { allowed: true, statusCode: 200 };
}

/**
 * Pure in-memory sliding-window rate limiter for demo & development protection.
 * Prevents rapid API credit exhaustion or accidental frontend loops.
 * 
 * Defaults to 30 requests per minute per client identifier.
 */
interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitRecord>();

export function checkAiRateLimit(
  clientIdentifier: string,
  maxRequests = 30,
  windowMs = 60000
): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  const record = rateLimitMap.get(clientIdentifier) || { timestamps: [] };
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  if (record.timestamps.length >= maxRequests) {
    const oldest = record.timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  record.timestamps.push(now);
  rateLimitMap.set(clientIdentifier, record);

  return {
    allowed: true,
    remaining: maxRequests - record.timestamps.length,
  };
}

/**
 * Per-business rate limiting & quota checking helper.
 * Keyed by business ID or user ID to ensure multi-tenant isolation.
 */
export function checkTenantAiRateLimit(
  businessId: string,
  maxRequestsPerMinute = 30
): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
  return checkAiRateLimit(`tenant:${businessId}`, maxRequestsPerMinute, 60000);
}

/**
 * Monthly AI credit quota tracker (defaults to 100 requests / month per business).
 */
const monthlyQuotaMap = new Map<string, { month: string; used: number }>();

export function checkTenantMonthlyQuota(
  businessId: string,
  monthlyLimit = 100
): { allowed: boolean; used: number; remaining: number } {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const record = monthlyQuotaMap.get(businessId) || { month: currentMonth, used: 0 };

  if (record.month !== currentMonth) {
    record.month = currentMonth;
    record.used = 0;
  }

  if (record.used >= monthlyLimit) {
    return { allowed: false, used: record.used, remaining: 0 };
  }

  record.used += 1;
  monthlyQuotaMap.set(businessId, record);

  return { allowed: true, used: record.used, remaining: monthlyLimit - record.used };
}

export function resetMonthlyQuotaStore(): void {
  monthlyQuotaMap.clear();
}

export function refundMonthlyQuota(businessId: string, credits = 1): void {
  const record = monthlyQuotaMap.get(businessId);
  if (record) {
    record.used = Math.max(0, record.used - credits);
    monthlyQuotaMap.set(businessId, record);
  }
}

export interface ConsumeQuotaParams {
  businessId: string;
  userId: string;
  endpoint: string;
  model: string;
  credits?: number;
  maxRequestsPerMinute?: number;
}

export interface ConsumeQuotaResult {
  allowed: boolean;
  requestLogId?: string;
  used?: number;
  quota?: number;
  remaining?: number;
  error?: string;
  message?: string;
  code?: string;
  retryAfterSeconds?: number;
  isDistributed: boolean;
}

/**
 * Atomic quota consumption & distributed rate limiting.
 * Executes transactional PostgreSQL consume_ai_quota RPC when migration 000007 is deployed.
 * In production (NODE_ENV === 'production'), in-memory fallback is strictly prohibited.
 * In development / test, falls back gracefully to tenant-isolated in-memory tracking.
 */
export async function consumeTenantAiQuota(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: any,
  params: ConsumeQuotaParams
): Promise<ConsumeQuotaResult> {
  const credits = params.credits ?? 1;
  const maxRpm = params.maxRequestsPerMinute ?? 30;
  const isProduction = process.env.NODE_ENV === "production";

  // 1. If authenticated Supabase client is available, attempt distributed database RPC
  if (supabaseClient && typeof supabaseClient.rpc === "function") {
    try {
      const { data, error } = await supabaseClient.rpc("consume_ai_quota", {
        p_business_id: params.businessId,
        p_user_id: params.userId,
        p_endpoint: params.endpoint,
        p_model: params.model,
        p_credits: credits,
        p_max_requests_per_minute: maxRpm,
      });

      if (!error && data) {
        return {
          allowed: Boolean(data.allowed),
          requestLogId: data.request_log_id,
          used: data.used,
          quota: data.quota,
          remaining: data.remaining,
          error: data.error,
          message: data.message,
          code: data.code,
          retryAfterSeconds: data.retry_after_seconds,
          isDistributed: true,
        };
      }

      if (error && isProduction) {
        return {
          allowed: false,
          error: "Persistent AI quota enforcement failed in production",
          message: `Production AI quota check failed: ${error.message}`,
          code: "AI_QUOTA_ENFORCEMENT_FAILED",
          isDistributed: true,
        };
      }
    } catch (rpcErr) {
      if (isProduction) {
        return {
          allowed: false,
          error: "Persistent AI quota enforcement failed in production",
          message: `Production AI quota check exception: ${(rpcErr as Error)?.message || "RPC call failed"}`,
          code: "AI_QUOTA_ENFORCEMENT_FAILED",
          isDistributed: true,
        };
      }
    }
  }

  // 2. Production fallback protection: Never fall back to in-memory quotas in production!
  if (isProduction) {
    return {
      allowed: false,
      error: "Persistent AI quota enforcement required in production",
      message: "AI quota RPC unavailable in production. Process-local in-memory fallback is prohibited.",
      code: "AI_PERSISTENT_QUOTA_REQUIRED",
      isDistributed: false,
    };
  }

  // 3. Sliding-window rate limit check (30 requests / minute) - Non-production only
  const rateCheck = checkTenantAiRateLimit(params.businessId, maxRpm);
  if (!rateCheck.allowed) {
    return {
      allowed: false,
      error: "Rate limit exceeded",
      message: `Too many AI requests. Please retry in ${rateCheck.retryAfterSeconds || 60} seconds.`,
      code: "RATE_LIMIT_EXCEEDED",
      retryAfterSeconds: rateCheck.retryAfterSeconds || 60,
      isDistributed: false,
    };
  }

  // 4. Monthly quota check (100 requests / month) - Non-production only
  const quotaCheck = checkTenantMonthlyQuota(params.businessId, 100);
  if (!quotaCheck.allowed) {
    return {
      allowed: false,
      error: "Monthly quota exceeded",
      message: "Monthly AI request quota (100 requests) has been reached for your business.",
      code: "QUOTA_EXCEEDED",
      used: quotaCheck.used,
      remaining: 0,
      quota: 100,
      isDistributed: false,
    };
  }

  return {
    allowed: true,
    requestLogId: `dev-log-${Date.now()}`,
    used: quotaCheck.used,
    remaining: quotaCheck.remaining,
    quota: 100,
    isDistributed: false,
  };
}

/**
 * Refunds quota credits when an AI request fails after initial reservation.
 * Ensures failed AI requests never consume tenant quotas.
 * Idempotent: tied to original requestLogId.
 */
export async function refundTenantAiQuota(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: any,
  params: {
    businessId: string;
    userId: string;
    requestLogId?: string;
    endpoint?: string;
    credits?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  const credits = params.credits ?? 1;
  const isProduction = process.env.NODE_ENV === "production";

  if (supabaseClient && typeof supabaseClient.rpc === "function") {
    try {
      const { data, error } = await supabaseClient.rpc("refund_ai_quota", {
        p_business_id: params.businessId,
        p_user_id: params.userId,
        p_request_log_id: params.requestLogId ?? null,
        p_credits: credits,
      });

      if (error) {
        console.error("refund_ai_quota RPC error:", error.message);
        return { success: false, error: error.message };
      }

      if (data && data.success === false) {
        console.error("refund_ai_quota refused:", data.error || data.code);
        return { success: false, error: data.error || data.code };
      }

      return { success: true };
    } catch (rpcErr) {
      const errMsg = (rpcErr as Error)?.message || "RPC exception";
      console.error("Failed to execute refund_ai_quota RPC:", errMsg);
      return { success: false, error: errMsg };
    }
  }

  if (!isProduction) {
    refundMonthlyQuota(params.businessId, credits);
    return { success: true };
  }

  return { success: false, error: "Persistent AI quota refund unavailable in production" };
}

export function resetRateLimitStore(): void {
  rateLimitMap.clear();
  monthlyQuotaMap.clear();
}

/**
 * Extracts client IP / identifier for local rate limiting.
 */
export function getClientIdentifier(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") || "local-client";
}

/**
 * Safely reads and validates the actual received request body stream against a maximum byte size.
 * Uses bounded streaming: reads chunk-by-chunk, tracks received bytes, and immediately halts and
 * cancels the stream the moment the byte limit is exceeded, preventing unbounded memory consumption.
 * 
 * Validates actual received content, immune to missing, zero, or spoofed Content-Length headers.
 */
export async function parseAndValidateJsonBody(
  req: Request,
  maxBytes: number
): Promise<
  | { success: true; data: unknown }
  | { success: false; errorResponse: { status: number; error: string; message: string } }
> {
  // 1. Pre-check Content-Length header if present as optional early fail-fast
  const headerLen = req.headers.get("content-length");
  if (headerLen && !isNaN(parseInt(headerLen, 10)) && parseInt(headerLen, 10) > maxBytes) {
    return {
      success: false,
      errorResponse: {
        status: 413,
        error: "Payload Too Large",
        message: `Request body exceeds maximum allowed limit of ${maxBytes} bytes.`,
      },
    };
  }

  // 2. Bounded stream reading
  if (!req.body) {
    return {
      success: false,
      errorResponse: {
        status: 400,
        error: "Malformed JSON payload",
        message: "The request body must be valid JSON.",
      },
    };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          // Immediately cancel the reader to stop further network streaming
          try {
            await reader.cancel("Payload exceeded maximum allowed byte limit");
          } catch {
            // Ignore cancellation error
          }
          return {
            success: false,
            errorResponse: {
              status: 413,
              error: "Payload Too Large",
              message: `Streamed request payload exceeded maximum allowed limit of ${maxBytes} bytes (received ${totalBytes} bytes before abort).`,
            },
          };
        }
        chunks.push(value);
      }
    }
  } catch (streamErr) {
    return {
      success: false,
      errorResponse: {
        status: 400,
        error: "Failed to read request body stream",
        message: (streamErr as Error).message || "Stream read error.",
      },
    };
  }

  // 3. Assemble and decode chunks
  const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const fullBuffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    fullBuffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const textDecoder = new TextDecoder("utf-8");
  const rawText = textDecoder.decode(fullBuffer);

  // 4. Safe JSON parsing
  try {
    const data = JSON.parse(rawText);
    return { success: true, data };
  } catch {
    return {
      success: false,
      errorResponse: {
        status: 400,
        error: "Malformed JSON payload",
        message: "The request body must be valid JSON.",
      },
    };
  }
}

// ============================================================================
// 3. Groq API Calling Helpers
// ============================================================================

export function getGroqApiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error("GROQ_API_KEY environment variable is not configured");
  }
  return key;
}

export function getGroqTextModel(): string {
  return process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b";
}

export function getGroqVisionModel(): string {
  return process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";
}

/**
 * Executes a chat completion request to the official Groq API endpoint.
 * Protected with a strict timeout (default 20 seconds) via AbortSignal.timeout().
 */
export async function callGroqChat(
  messages: Array<{ role: string; content: unknown }>,
  model: string,
  jsonMode = false,
  timeoutMs = 20000
) {
  const apiKey = getGroqApiKey();
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.1, // low temperature for consistent, factual extraction
  };

  if (jsonMode) {
    payload.response_format = { type: "json_object" };
  }

  const signal = AbortSignal.timeout(timeoutMs);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API returned HTTP ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq API returned an empty response");
  }

  return content;
}

// ============================================================================
// 4. Deterministic Fallback Logic (For Offline, Tests, or API Failures)
// ============================================================================

/**
 * Deterministic fallback parser for WhatsApp payment promise messages.
 * Used for automated unit tests and network error recovery.
 */
export function fallbackParsePaymentPromise(
  messageText: string,
  referenceDate: string = new Date().toISOString().slice(0, 10)
): PaymentPromiseResult {
  const text = messageText.trim();
  let promisedAmount: number | null = null;
  let promisedDate: string | null = null;
  let needsClarification = false;
  const clarificationReasons: string[] = [];

  // Extract amount: e.g. "₹5,000", "5000", "6k", "7.5k"
  const rupeeMatch = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i);
  const kMatch = text.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  const plainNumMatch = text.match(/\b(\d{4,6})\b/);

  if (rupeeMatch) {
    promisedAmount = parseFloat(rupeeMatch[1].replace(/,/g, ""));
  } else if (kMatch) {
    promisedAmount = parseFloat(kMatch[1]) * 1000;
  } else if (plainNumMatch) {
    promisedAmount = parseFloat(plainNumMatch[1]);
  }

  if (promisedAmount === null) {
    needsClarification = true;
    clarificationReasons.push("Promised amount not clearly stated");
  }

  // Extract date: e.g. "15 Dec", "15th", "Friday", "tonight", "tomorrow"
  const [refY, refM, refD] = referenceDate.split("-").map(Number);
  const dateObj = new Date(Date.UTC(refY, refM - 1, refD));

  const monthNames: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };

  const monthRegexPattern = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  const dayThenMonth = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthRegexPattern})\\b`, "i"));
  const monthThenDay = text.match(new RegExp(`\\b(${monthRegexPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"));
  const dayOnlyMatch = text.match(/\b(?:on|by|before)?\s*(\d{1,2})(?:st|nd|rd|th)\b/i);

  if (dayThenMonth) {
    const day = parseInt(dayThenMonth[1], 10);
    const month = monthNames[dayThenMonth[2].toLowerCase()];
    let year = refY;
    if (month < refM) year += 1;
    promisedDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } else if (monthThenDay) {
    const day = parseInt(monthThenDay[2], 10);
    const month = monthNames[monthThenDay[1].toLowerCase()];
    let year = refY;
    if (month < refM) year += 1;
    promisedDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } else if (dayOnlyMatch) {
    const day = parseInt(dayOnlyMatch[1], 10);
    promisedDate = `${refY}-${String(refM).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } else if (/\btomorrow\b/i.test(text)) {
    dateObj.setUTCDate(dateObj.getUTCDate() + 1);
    promisedDate = dateObj.toISOString().slice(0, 10);
  } else if (/\btonight|today\b/i.test(text)) {
    promisedDate = referenceDate;
  }

  if (!promisedDate) {
    needsClarification = true;
    clarificationReasons.push("Payment date is ambiguous or missing");
  }

  // Detect payment method
  let paymentMethod: string | null = null;
  if (/gpay|google\s*pay/i.test(text)) paymentMethod = "Google Pay";
  else if (/phonepe/i.test(text)) paymentMethod = "PhonePe";
  else if (/paytm/i.test(text)) paymentMethod = "Paytm";
  else if (/upi/i.test(text)) paymentMethod = "UPI";
  else if (/cash/i.test(text)) paymentMethod = "Cash";
  else if (/neft|net\s*banking|transfer/i.test(text)) paymentMethod = "Net Banking";

  // Calculate confidence score
  let score = 0.5;
  if (promisedAmount !== null) score += 0.25;
  if (promisedDate !== null) score += 0.25;
  if (needsClarification) score = Math.min(0.65, score);

  return {
    parentName: null,
    studentName: null,
    promisedAmount,
    promisedDate,
    paymentMethod,
    invoiceReference: null,
    summary: text.slice(0, 120),
    confidenceScore: Math.round(score * 100) / 100,
    needsClarification,
    clarificationReason: clarificationReasons.length > 0 ? clarificationReasons.join("; ") : null,
  };
}

/**
 * Deterministic fallback parser for general vendor expense receipt OCR.
 */
export function fallbackExtractReceipt(notes = "Paper bill"): ReceiptExtractResult {
  return {
    merchantName: "Sample Stationery & Materials Mart",
    transactionDate: "2026-11-20",
    totalAmount: 1850,
    paymentMethod: "UPI",
    transactionReference: "UPI/REC-294821",
    category: "Materials",
    lineItems: [
      { description: "Pre-board test paper printing", amount: 1250 },
      { description: "OMR answer sheets bundle", amount: 600 },
    ],
    confidenceScore: 0.88,
    isBankVerified: false,
    notes: `Simulated OCR result from image: ${notes}`,
  };
}

/**
 * Deterministic fallback parser for student payment confirmation screenshots (UPI/GPay/PhonePe).
 */
export function fallbackExtractPaymentScreenshot(): PaymentScreenshotResult {
  return {
    payerName: "Suresh Nair",
    receiverName: "Coaching Academy",
    amount: 6000,
    transactionDate: new Date().toISOString().slice(0, 10),
    paymentMethod: "Google Pay (UPI)",
    utrReference: "GPay/445892103847",
    confidenceScore: 0.95,
    isBankVerified: false,
    disclaimer: "Extracted from image — not bank verified.",
  };
}
