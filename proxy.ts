// Next.js 16 renamed `middleware` to `proxy`. This keeps the Supabase session
// cookie fresh on every request so the phone and the desktop stay signed in.
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/session';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and /api
     * (the solver route does its own auth check and must never be redirected).
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
