import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { NextResponse, connection, type NextRequest } from 'next/server';
import { cache } from 'react';

export interface UserSession {
  user: User;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

export interface ApiAuthResult {
  user: User | null;
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>> | null;
  errorResponse: NextResponse | null;
}

/**
 * Server-side guard that independently verifies the authenticated Supabase user.
 * Redirects to /login if unauthenticated.
 * Memoized per-request with React cache() to prevent redundant auth network roundtrips.
 */
export const requireUser = cache(async (): Promise<UserSession> => {
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
});

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
            return {
              user: tokenData.user,
              supabase: directClient,
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

/**
 * Checks whether an exception was thrown by Next.js redirect().
 */
export function isRedirectError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'digest' in err) {
    const digest = String((err as { digest: unknown }).digest);
    return digest.startsWith('NEXT_REDIRECT');
  }
  return false;
}

/**
 * Sanitizes raw SQL and database error messages so internal schema details,
 * column names, and raw database driver outputs are not leaked to users.
 */
export function sanitizeDatabaseError(rawMessage: string, fallbackMessage: string): string {
  if (!rawMessage) return fallbackMessage;
  if (rawMessage.includes('unique constraint') || rawMessage.includes('duplicate key')) {
    if (rawMessage.includes('invoice_number')) return 'An invoice with this number already exists.';
    if (rawMessage.includes('reference') || rawMessage.includes('uq_payments')) {
      return 'A payment or reference with this ID has already been recorded.';
    }
    return 'A record with this information already exists.';
  }
  if (rawMessage.includes('violates foreign key') || rawMessage.includes('foreign key constraint')) {
    return 'The referenced student, invoice, or record was not found.';
  }
  if (rawMessage.includes('violates check constraint') || rawMessage.includes('check constraint')) {
    return 'The submitted data does not meet validity requirements.';
  }
  if (
    rawMessage.includes('syntax error') ||
    rawMessage.includes('relation "') ||
    rawMessage.includes('column "') ||
    rawMessage.includes('schema "')
  ) {
    return fallbackMessage;
  }
  return rawMessage;
}

/**
 * Common error handler for Server Actions:
 * - Re-throws Next.js redirect exceptions so authentication redirects function properly.
 * - Sanitizes database errors before returning to client.
 */
export function handleActionError(
  err: unknown,
  defaultMessage: string
): { success: false; error: string } {
  if (isRedirectError(err)) {
    throw err;
  }
  const rawMsg = err instanceof Error ? err.message : defaultMessage;
  return { success: false, error: sanitizeDatabaseError(rawMsg, defaultMessage) };
}
