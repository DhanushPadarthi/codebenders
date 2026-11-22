import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const rawNext = requestUrl.searchParams.get('next') ?? '/';
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  // Validate redirect destination to prevent open redirects
  let next = '/';
  if (rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('\\')) {
    next = rawNext;
  }

  if (error || errorDescription) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', errorDescription || error || 'Authentication failed');
    return NextResponse.redirect(loginUrl);
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', exchangeError.message);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL('/login', request.url));
}
