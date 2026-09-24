'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { getBrowserClient } from '@/lib/supabase/client';

/**
 * There is one user. So there are no accounts here — just a passcode.
 *
 * The gate itself still has to exist: NEXT_PUBLIC_SUPABASE_ANON_KEY ships in
 * the client bundle, and the only reason that is harmless is that every row
 * and every photo is behind an `auth.uid()` policy. Drop the session and the
 * database, the storage bucket and /api/solve (which spends real money) are all
 * open to whoever finds the URL.
 *
 * So the session stays exactly as it was, and only the way you obtain it
 * changes: the passcode is the password of a single Supabase user whose email
 * is a build-time constant. Same cookie, same refresh, same RLS — no inbox.
 */
const APP_EMAIL = process.env.NEXT_PUBLIC_APP_EMAIL ?? '';

function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') || '/app';
  const { t } = useI18n();

  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!APP_EMAIL) {
      setError(t('login.notConfigured'));
      return;
    }

    setBusy(true);
    setError(null);

    const supabase = getBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: APP_EMAIL,
      password: passcode,
    });

    if (error) {
      setBusy(false);
      setPasscode('');
      // Supabase says "Invalid login credentials" for a wrong password. With
      // one fixed account that can only mean the passcode.
      setError(
        /invalid login credentials/i.test(error.message) ? t('login.wrong') : error.message
      );
      return;
    }

    // Full navigation, not a soft one: the server has to read the cookie the
    // client just wrote before it decides whether /app is allowed.
    window.location.replace(next);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-medium/25 to-accent-fine/25 ring-1 ring-ink-700">
            <span className="text-xl">⌘</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Coding Helper</h1>
          <p className="mt-2 text-sm text-ink-400">{t('app.tagline')}</p>
        </div>

        <div className="rounded-2xl border border-ink-800 bg-ink-900/70 p-6 backdrop-blur">
          <form onSubmit={unlock} className="space-y-3">
            <input
              type="password"
              required
              autoFocus
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder={t('login.placeholder')}
              autoComplete="current-password"
              className="w-full rounded-xl border border-ink-700 bg-ink-850 px-4 py-2.5 text-sm outline-none transition placeholder:text-ink-600 focus:border-accent-medium/60"
            />
            <button
              type="submit"
              disabled={busy || !passcode}
              className="w-full rounded-xl bg-ink-800 px-4 py-2.5 text-sm font-medium ring-1 ring-ink-700 transition hover:bg-ink-700 disabled:opacity-50"
            >
              {busy ? t('login.unlocking') : t('login.unlock')}
            </button>
          </form>

          {error && <p className="mt-4 text-xs text-red-400">{error}</p>}
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-ink-600">{t('login.hint')}</p>
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
