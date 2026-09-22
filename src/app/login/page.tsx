'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase/client';

function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') || '/app';

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const siteUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL || '';
  const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;

  /*
   * Google is opt-in. signInWithOAuth navigates the whole browser to Supabase's
   * /authorize endpoint, so if the provider isn't enabled you don't get a catchable
   * error — you get a page of raw JSON reading "provider is not enabled". Hiding
   * the button until it's actually configured is the only way to avoid that.
   * Turn it on with NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true after enabling Google
   * under Supabase -> Authentication -> Providers.
   */
  const googleEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === 'true';

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function google() {
    setError(null);
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) {
      setError(
        /not enabled|unsupported provider/i.test(error.message)
          ? 'Google sign-in is not enabled on this Supabase project. Use the email link instead.'
          : error.message
      );
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-fast/25 to-accent-fine/25 ring-1 ring-ink-700">
            <span className="text-xl">⌘</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Coding Helper</h1>
          <p className="mt-2 text-sm text-ink-400">
            Snap a problem on your phone. Read the answer anywhere you&apos;re signed in.
          </p>
        </div>

        <div className="rounded-2xl border border-ink-800 bg-ink-900/70 p-6 backdrop-blur">
          {sent ? (
            <div className="text-center">
              <p className="text-sm text-ink-100">Check your inbox.</p>
              <p className="mt-2 text-sm text-ink-400">
                We sent a sign-in link to <span className="text-ink-100">{email}</span>. Open it on
                this device — or on any other device you want signed in.
              </p>
              <button
                onClick={() => setSent(false)}
                className="mt-5 text-xs text-ink-400 underline underline-offset-4 hover:text-ink-100"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              {googleEnabled && (
              <button
                onClick={google}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-ink-100"
              >
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
                  <path
                    fill="#4285F4"
                    d="M45 24c0-1.6-.1-2.7-.4-4H24v7.5h12c-.2 2-1.5 5-4.4 7l6.7 5.2C42.2 36.2 45 30.7 45 24z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.7-5.2c-1.9 1.3-4.4 2.2-7.8 2.2-6 0-11-4-12.8-9.5l-7 5.4C7.7 40.9 15.2 46 24 46z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M11.2 28.2A13.5 13.5 0 0 1 10.5 24c0-1.5.3-2.9.7-4.2l-7-5.4A22 22 0 0 0 2 24c0 3.5.9 6.9 2.2 9.6l7-5.4z"
                  />
                  <path
                    fill="#EA4335"
                    d="M24 10.2c3.4 0 5.7 1.5 7 2.7l5.9-5.7C33.3 3.9 29.4 2 24 2 15.2 2 7.7 7.1 4.2 14.4l7 5.4C13 14.2 18 10.2 24 10.2z"
                  />
                </svg>
                Continue with Google
              </button>
              )}

              {googleEnabled && (
                <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-ink-600">
                  <span className="h-px flex-1 bg-ink-800" />
                  or
                  <span className="h-px flex-1 bg-ink-800" />
                </div>
              )}

              <form onSubmit={sendLink} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full rounded-xl border border-ink-700 bg-ink-850 px-4 py-2.5 text-sm outline-none transition placeholder:text-ink-600 focus:border-accent-fast/60"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-ink-800 px-4 py-2.5 text-sm font-medium ring-1 ring-ink-700 transition hover:bg-ink-700 disabled:opacity-50"
                >
                  {busy ? 'Sending…' : 'Email me a sign-in link'}
                </button>
              </form>
            </>
          )}

          {error && <p className="mt-4 text-xs text-red-400">{error}</p>}
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-ink-600">
          Sign in with the same account on your phone and your computer — results appear on both
          at once.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <LoginForm />
    </Suspense>
  );
}
