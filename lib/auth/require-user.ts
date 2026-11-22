import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient, type User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { NextResponse, connection, type NextRequest } from 'next/server';

export interface UserSession {
  user: User;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

export interface ApiAuthResult {
  user: User | null;
  supabase: Awaited<ReturnType<typeof createClient>> | null;
  errorResponse: NextResponse | null;
}

/**
 * Server-side guard that independently verifies the authenticated Supabase user.
 * Redirects to /login if unauthenticated.
 */
export async function requireUser(): Promise<UserSession> {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  return { user, supabase };
}

/**
 * Server-side guard for Route Handlers (API endpoints).
 * Returns the authenticated user and Supabase client, or a 401 Unauthorized NextResponse.
 * Supports both cookie-based sessions (browser fetch) and Bearer tokens (API/test clients).
 */
export async function requireApiUser(req?: NextRequest | Request): Promise<ApiAuthResult> {
  // 1. Inspect Authorization Bearer header if present
  if (req) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseAnonKey) {
          const directClient = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
            auth: { autoRefreshToken: false, persistSession: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
          const { data: tokenData, error: tokenError } = await directClient.auth.getUser(token);
          if (!tokenError && tokenData?.user) {
            const serverClient = await createClient().catch(() => null);
            return {
              user: tokenData.user,
              supabase: serverClient,
              errorResponse: null,
            };
          }
        }
      }
    }
  }

  // 2. Fall back to cookie-based session verification via SSR client
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        user: null,
        supabase: null,
        errorResponse: NextResponse.json(
          {
            error: 'Unauthorized',
            message: 'Authentication required to access this endpoint.',
            code: 'AUTH_REQUIRED',
          },
          { status: 401 }
        ),
      };
    }

    return { user, supabase, errorResponse: null };
  } catch {
    return {
      user: null,
      supabase: null,
      errorResponse: NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Failed to verify session.',
          code: 'AUTH_VERIFICATION_FAILED',
        },
        { status: 401 }
      ),
    };
  }
}

/**
 * Optional server-side user lookup (for headers, sidebars, or hybrid views).
 */
export async function getUserOptional(): Promise<{ user: User | null; supabase: Awaited<ReturnType<typeof createClient>> | null }> {
  try {
    await connection();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { user, supabase };
  } catch {
    return { user: null, supabase: null };
  }
}
