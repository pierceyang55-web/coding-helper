'use client';

import { useRef } from 'react';
import { LANGUAGES } from '@/lib/types';

interface Props {
  language: string;
  onLanguageChange: (v: string) => void;
  onFile: (f: File) => void;
  busy: boolean;
  error: string | null;
}

export default function CaptureCard({
  language,
  onLanguageChange,
  onFile,
  busy,
  error,
}: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = '';
  }

  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
          New problem
        </h2>
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-xs text-ink-300 outline-none focus:border-accent-fast/60"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={pick}
        className="hidden"
      />
      <input ref={fileRef} type="file" accept="image/*" onChange={pick} className="hidden" />

      <button
        onClick={() => cameraRef.current?.click()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-accent-fast/25 to-accent-fast/10 px-4 py-3.5 text-sm font-semibold text-white ring-1 ring-accent-fast/40 transition hover:from-accent-fast/35 disabled:opacity-50"
      >
        {busy ? (
          <>
            <span className="h-1.5 w-1.5 animate-pulse-bar rounded-full bg-white" />
            Uploading…
          </>
        ) : (
          <>📷 Take a photo</>
        )}
      </button>

      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="mt-2 w-full rounded-xl bg-ink-850 px-4 py-2.5 text-xs font-medium text-ink-300 ring-1 ring-ink-700 transition hover:bg-ink-800 disabled:opacity-50"
      >
        Choose an existing image
      </button>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-600">
        All three modes start the moment you upload. Fast answers in ~10s, Medium in ~30s, Fine
        keeps going until it&apos;s done.
      </p>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
