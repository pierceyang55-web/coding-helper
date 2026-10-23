import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Sign in with a passcode.
 *
 * There is one user, so the account's email is a constant — but it is the
 * user's personal address, so it stays here on the server. `APP_EMAIL` has no
 * NEXT_PUBLIC_ prefix, which is what keeps Next from inlining it into the
 * client bundle. The browser only ever sends the passcode.
 *
 * The session itself is unchanged: the Supabase client writes the same cookies
 * the magic-link flow wrote, the proxy refreshes them the same way, and every
 * row stays behind the same `auth.uid()` policies. Only the way the session is
 * obtained has changed — and this way does not send email, so it cannot hit
 * the provider's rate limit.
 */
export async function POST(request: Request) {
  const email = process.env.APP_EMAIL;
  if (!email) {
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  let body: { passcode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const passcode = body.passcode;
  if (typeof passcode !== 'string' || !passcode) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password: passcode });

  if (error) {
    // Supabase rate-limits repeated failures itself. Say nothing about which
    // part was wrong — with one fixed account it can only be the passcode.
    return NextResponse.json({ error: 'invalid' }, { status: 401 });
  }

  // The cookies were written through createServerSupabase's cookie handler.
  return NextResponse.json({ ok: true });
}
