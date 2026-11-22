import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ensureDemoAccount,
  checkDemoLoginRateLimit,
  DEMO_USER_EMAIL,
  DEMO_USER_PASSWORD,
} from "@/lib/auth/demo-account";

export async function POST(req: NextRequest) {
  try {
    // 1. In-memory IP rate limiting (max 10 demo logins per min per client IP)
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    const rateCheck = checkDemoLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: "Too many demo requests",
          message: `Rate limit reached. Please retry in ${rateCheck.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateCheck.retryAfterSeconds || 60) },
        }
      );
    }

    // 2. Fast-Path: Directly authenticate demo session server-side using @supabase/ssr (sets HTTP-only cookies)
    const supabase = await createClient();
    let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: DEMO_USER_EMAIL,
      password: DEMO_USER_PASSWORD,
    });

    // 3. Fallback: If demo account is missing or needs setup, provision it and retry sign-in
    if (signInError || !signInData?.session) {
      console.log("[Demo Login] Fast-path missed, provisioning demo account...");
      await ensureDemoAccount();
      const retry = await supabase.auth.signInWithPassword({
        email: DEMO_USER_EMAIL,
        password: DEMO_USER_PASSWORD,
      });
      signInData = retry.data;
      signInError = retry.error;
    }

    if (signInError || !signInData.session) {
      return NextResponse.json(
        {
          error: "Demo authentication failed",
          message: signInError?.message || "Failed to establish demo session.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      redirect: "/",
      user: {
        id: signInData.user.id,
        email: signInData.user.email,
        name: signInData.user.user_metadata?.full_name || "Prof. Rajesh Sharma",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected server error during demo login.";
    console.error("[Demo Login Error]:", message);
    return NextResponse.json(
      { error: "Demo initialization error", message },
      { status: 500 }
    );
  }
}
