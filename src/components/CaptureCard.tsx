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
   * Filled in with a function that opens the photo picker, so the header's
   * "new problem" button can reach it. The card owns the file inputs; this
   * hands out the one capability the header needs rather than lifting them.
   */
  openPickerRef?: React.MutableRefObject<(() => void) | null>;
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
  openPickerRef,
}: Props) {
  const { t } = useI18n();
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);

  useEffect(() => {
    if (!openPickerRef) return;
    openPickerRef.current = () => libraryRef.current?.click();
    return () => {
      openPickerRef.current = null;
    };
  }, [openPickerRef]);

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

  const full = pending.length >= MAX_IMAGES;

  /** Selecting again appends, so you can mix library picks and fresh shots. */
  function add(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // let the same file be chosen twice in a row
    if (!picked.length) return;

    setPending((prev) => {
      const room = MAX_IMAGES - prev.length;
      const next = picked.slice(0, room).map((file) => ({
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
        {pending.length > 1
          ? t('capture.hintMulti')
          : t('capture.hintSingle', { n: MAX_IMAGES })}
      </p>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
