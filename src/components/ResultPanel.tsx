'use client';

import { useEffect, useRef } from 'react';
import Markdown from './Markdown';
import { MODES } from '@/lib/modes';
import type { Mode, Result } from '@/lib/types';

interface Props {
  mode: Mode;
  result: Result | undefined;
  hasSubmission: boolean;
}

/** The model is told to emit `TITLE: ...` first — useful as a heading, noise in the body. */
function stripTitle(text: string) {
  return text.replace(/^\s*TITLE:.*(\r?\n)+/, '');
}

export default function ResultPanel({ mode, result, hasSubmission }: Props) {
  const cfg = MODES[mode];
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  const streaming = result?.status === 'streaming';
  const body = stripTitle(result?.content ?? '');

  useEffect(() => {
    if (streaming && pinned.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [body, streaming]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  if (!hasSubmission) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 text-3xl opacity-40">📷</div>
        <p className="text-sm text-ink-300">No problem captured yet</p>
        <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-ink-600">
          Take a photo of a question on your phone. All three modes start at once and land here
          on every device you&apos;re signed in on.
        </p>
      </div>
    );
  }

  if (!result || result.status === 'queued') {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-3 flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-pulse-bar rounded-full"
              style={{ backgroundColor: cfg.color, animationDelay: `${i * 180}ms` }}
            />
          ))}
        </div>
        <p className="text-sm text-ink-300">Queued</p>
        <p className="mt-1 text-xs text-ink-600">{cfg.model}</p>
      </div>
    );
  }

  if (result.status === 'error' && !body.trim()) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm text-red-400">This pass failed</p>
        <p className="mt-2 max-w-sm text-xs leading-relaxed text-ink-400">
          {result.error ?? 'Unknown error'}
        </p>
      </div>
    );
  }

  return (
    <div onScroll={onScroll} className="h-full overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
      {!body.trim() && streaming ? (
        <div className="space-y-2.5">
          {[85, 70, 92, 60].map((w, i) => (
            <div
              key={i}
              className="h-3 animate-pulse-bar rounded bg-ink-800"
              style={{ width: `${w}%`, animationDelay: `${i * 140}ms` }}
            />
          ))}
        </div>
      ) : (
        <Markdown>{body}</Markdown>
      )}

      {streaming && body.trim() && (
        <span
          className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse-bar"
          style={{ backgroundColor: cfg.color }}
        />
      )}

      {result.status === 'timeout' && (
        <p className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-300/90">
          Stopped at the {cfg.budgetMs / 1000}s ceiling for {cfg.label} mode — everything above is
          what arrived in time. Switch to a slower tab for the complete answer.
        </p>
      )}

      {result.status === 'error' && (
        <p className="mt-6 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-xs text-red-300/90">
          {result.error}
        </p>
      )}

      {result.status === 'done' && result.elapsed_ms != null && (
        <p className="mt-8 border-t border-ink-800 pt-4 text-[11px] text-ink-600">
          {result.model} · {(result.elapsed_ms / 1000).toFixed(1)}s
        </p>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
