'use client';

import { useEffect, useRef, useState } from 'react';
import { MODES, MODE_ORDER, TYPICAL_COST, formatCost } from '@/lib/modes';
import { useI18n } from '@/lib/i18n';
import { LANGUAGES, MAX_IMAGES, type Mode } from '@/lib/types';

interface Props {
  language: string;
  onLanguageChange: (v: string) => void;
  /**
   * Called once, with every photo of the problem and the mode to run it with.
   * Which button you press is which model solves it — nothing starts on its
   * own, so the spend is always something you chose.
   */
  onSubmit: (files: File[], mode: Mode) => void;
  busy: boolean;
  error: string | null;
  /**
   * The problem these photos will be added to, or null when the next upload
   * starts a fresh one. Uploading without clearing it is a follow-up: more
   * pages of the same question, re-read together.
   */
  followUp: { id: string; title: string | null; photoCount: number } | null;
  /** Clears the active problem so the next upload starts a new one. */
  onNewProblem: () => void;
}

interface Pending {
  /** Stable key so React keeps the right <img> when one is removed. */
  key: string;
  file: File;
  url: string;
}

let seq = 0;

export default function CaptureCard({
  language,
  onLanguageChange,
  onSubmit,
  busy,
  error,
  followUp,
  onNewProblem,
}: Props) {
  const { t } = useI18n();
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);

  // Photos picked for one problem must not follow you to another. Switching
  // problems — or starting a new one — drops whatever was staged.
  const followUpId = followUp?.id ?? null;
  useEffect(() => {
    setPending((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.url);
      return [];
    });
  }, [followUpId]);

  // A follow-up shares the six-photo budget with the pages already attached.
  const alreadyUsed = followUp?.photoCount ?? 0;
  const room = Math.max(0, MAX_IMAGES - alreadyUsed - pending.length);

  // Object URLs are only freed when we say so — do it on unmount for whatever
  // is still queued. Individual removals revoke eagerly in `remove`.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(
    () => () => {
      for (const p of pendingRef.current) URL.revokeObjectURL(p.url);
    },
    []
  );

  const full = room === 0;

  /** Selecting again appends, so you can mix library picks and fresh shots. */
  function add(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // let the same file be chosen twice in a row
    if (!picked.length) return;

    setPending((prev) => {
      const left = Math.max(0, MAX_IMAGES - alreadyUsed - prev.length);
      const next = picked.slice(0, left).map((file) => ({
        key: `p${seq++}`,
        file,
        url: URL.createObjectURL(file),
      }));
      return [...prev, ...next];
    });
  }

  function remove(key: string) {
    setPending((prev) => {
      const hit = prev.find((p) => p.key === key);
      if (hit) URL.revokeObjectURL(hit.url);
      return prev.filter((p) => p.key !== key);
    });
  }

  function clearAll() {
    for (const p of pending) URL.revokeObjectURL(p.url);
    setPending([]);
  }

  function submit(mode: Mode) {
    if (!pending.length || busy) return;
    const files = pending.map((p) => p.file);
    // The parent owns the files from here; drop our previews.
    clearAll();
    onSubmit(files, mode);
  }

  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
          {t('capture.heading')}
        </h2>
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-xs text-ink-300 outline-none focus:border-accent-medium/60"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* No `capture` attribute: iOS offers Photo Library first, which is what
          most problems come from. The camera has its own button below. */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        onChange={add}
        className="hidden"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={add}
        className="hidden"
      />

      <button
        onClick={() => libraryRef.current?.click()}
        disabled={busy || full}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-accent-medium/25 to-accent-medium/10 px-4 py-3.5 text-sm font-semibold text-white ring-1 ring-accent-medium/40 transition hover:from-accent-medium/35 disabled:opacity-50"
      >
        🖼 {pending.length ? t('capture.addMore') : t('capture.choose')}
      </button>

      <button
        onClick={() => cameraRef.current?.click()}
        disabled={busy || full}
        className="mt-2 w-full rounded-xl bg-ink-850 px-4 py-2.5 text-xs font-medium text-ink-300 ring-1 ring-ink-700 transition hover:bg-ink-800 disabled:opacity-50"
      >
        📷 {t('capture.takePhoto')}
      </button>

      {/* Where the next upload lands. Without saying it, "add a photo" is
          ambiguous between another page of this question and a new one. */}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-ink-900/80 px-3 py-2 ring-1 ring-ink-800">
        <span className="min-w-0 flex-1 text-[11px] leading-snug text-ink-400">
          {followUp ? (
            <>
              {t('capture.addingTo')}{' '}
              <span className="font-medium text-ink-200">
                {followUp.title ?? t('history.reading')}
              </span>
              <span className="text-ink-600">
                {' '}
                · {t('capture.pagesSoFar', { n: followUp.photoCount })}
              </span>
            </>
          ) : (
            <span className="text-ink-300">{t('capture.willStartNew')}</span>
          )}
        </span>

        {followUp && (
          <button
            onClick={onNewProblem}
            disabled={busy}
            className="shrink-0 rounded-lg bg-accent-medium/15 px-2.5 py-1 text-[11px] font-semibold text-accent-medium ring-1 ring-accent-medium/40 transition hover:bg-accent-medium/25 disabled:opacity-50"
          >
            + {t('app.newProblem')}
          </button>
        )}
      </div>

      {/* ------------------------------------------------- pending photos -- */}
      {pending.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink-400">
              {t('capture.ready', { n: pending.length, s: pending.length > 1 ? 's' : '' })}
              {full ? t('capture.max', { n: MAX_IMAGES }) : ''}
            </span>
            <button
              onClick={clearAll}
              disabled={busy}
              className="text-[11px] text-ink-600 transition hover:text-ink-300 disabled:opacity-50"
            >
              {t('capture.clear')}
            </button>
          </div>

          <ul className="grid grid-cols-3 gap-2">
            {pending.map((p, i) => (
              <li key={p.key} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={`Page ${i + 1}`}
                  className="aspect-[3/4] w-full rounded-lg object-cover ring-1 ring-ink-700"
                />
                <span className="absolute left-1 top-1 rounded bg-ink-950/80 px-1.5 py-0.5 text-[10px] font-medium text-ink-200">
                  {i + 1}
                </span>
                <button
                  onClick={() => remove(p.key)}
                  disabled={busy}
                  aria-label={t('capture.removePhoto', { n: i + 1 })}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink-950/85 text-xs text-ink-300 ring-1 ring-ink-700 transition hover:text-red-400 disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          {busy ? (
            <div className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-ink-850 px-4 py-3 text-sm font-medium text-ink-300 ring-1 ring-ink-700">
              <span className="h-1.5 w-1.5 animate-pulse-bar rounded-full bg-ink-300" />
              {t('capture.uploading')}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {MODE_ORDER.map((mode) => {
                const cfg = MODES[mode];
                return (
                  <button
                    key={mode}
                    onClick={() => submit(mode)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition"
                    style={{
                      backgroundColor: `${cfg.color}1f`,
                      color: cfg.color,
                      boxShadow: `inset 0 0 0 1px ${cfg.color}66`,
                    }}
                  >
                    <span>{t('capture.solveWith', { mode: cfg.label })}</span>
                    <span className="text-[11px] font-normal tabular-nums opacity-70">
                      ~{formatCost(TYPICAL_COST[mode])}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-ink-600">
        {followUp ? t('capture.hintFollowUp') : t('capture.hintSingle', { n: MAX_IMAGES })}
      </p>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
