'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Markdown from './Markdown';
import { AUTO_MODES, MODES, TYPICAL_COST, costOf, formatCost } from '@/lib/modes';
import { useI18n } from '@/lib/i18n';
import type { Mode, Result } from '@/lib/types';

interface Props {
  mode: Mode;
  result: Result | undefined;
  hasSubmission: boolean;
  /** Starts this pass. Used both for the first run and for ↻. */
  onRun: () => void;
}

/** The model is told to emit `TITLE: ...` first — useful as a heading, noise in the body. */
function stripTitle(text: string) {
  return text.replace(/^\s*TITLE:.*(\r?\n)+/, '');
}

/** Anything closer than this to the bottom counts as "at the bottom". */
const BOTTOM_SLACK = 80;

export default function ResultPanel({ mode, result, hasSubmission, onRun }: Props) {
  const cfg = MODES[mode];
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * Off by default: the answer is there to be read from the top, and yanking
   * the viewport on every token makes that impossible. Turning it on is an
   * explicit choice, and scrolling away turns it back off.
   */
  const [follow, setFollow] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const streaming = result?.status === 'streaming';
  const body = stripTitle(result?.content ?? '');

  // A different tab or problem is a fresh read — never inherit follow.
  useEffect(() => {
    setFollow(false);
    setAtBottom(true);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [mode, result?.submission_id]);

  const toBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    // Scrolls this panel only. `scrollIntoView` would scroll the page behind it
    // too, which on a phone drags the whole layout around mid-answer.
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    if (streaming && follow) toBottom();
  }, [body, streaming, follow, toBottom]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const bottom = distance < BOTTOM_SLACK;
    setAtBottom(bottom);
    // Scrolling up while following is how you take back control.
    if (follow && !bottom) setFollow(false);
  }

  if (!hasSubmission) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 text-3xl opacity-40">🖼</div>
        <p className="text-sm text-ink-300">{t('panel.emptyTitle')}</p>
        <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-ink-600">
          {t('panel.emptyBody')}
        </p>
      </div>
    );
  }

  if (!result || result.status === 'queued') {
    // A queued pass that never auto-starts is waiting on the user, not on a
    // worker — so offer the button and the price rather than a spinner.
    const onDemand = !AUTO_MODES.includes(mode);

    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
        {onDemand ? (
          <>
            <p className="max-w-xs text-xs leading-relaxed text-ink-500">
              {t('panel.onDemandBody', { mode: cfg.label })}
            </p>
            <button
              onClick={onRun}
              className="mt-4 rounded-xl px-4 py-2.5 text-sm font-semibold transition"
              style={{
                backgroundColor: `${cfg.color}1f`,
                color: cfg.color,
                boxShadow: `inset 0 0 0 1px ${cfg.color}66`,
              }}
            >
              {t('panel.startMode', { mode: cfg.label })}
            </button>
            <p className="mt-2.5 text-[11px] text-ink-600">
              {cfg.model} · {t('panel.estimatedCost', { cost: formatCost(TYPICAL_COST[mode]) })}
            </p>
          </>
        ) : (
          <>
            <div className="mb-3 flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-pulse-bar rounded-full"
                  style={{ backgroundColor: cfg.color, animationDelay: `${i * 180}ms` }}
                />
              ))}
            </div>
            <p className="text-sm text-ink-300">{t('panel.queued')}</p>
            <p className="mt-1 text-xs text-ink-600">{cfg.model}</p>
          </>
        )}
      </div>
    );
  }

  if (result.status === 'error' && !body.trim()) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm text-red-400">{t('panel.failed')}</p>
        <p className="mt-2 max-w-sm text-xs leading-relaxed text-ink-400">
          {result.error ?? t('panel.unknownError')}
        </p>
      </div>
    );
  }

  // The follow control only earns its space while text is still arriving.
  const showFollow = streaming && body.trim().length > 0;

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto px-5 py-5 sm:px-7 sm:py-6"
      >
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
            {t('panel.timeout', { s: cfg.budgetMs / 1000, mode: cfg.label })}
          </p>
        )}

        {result.status === 'error' && (
          <p className="mt-6 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-xs text-red-300/90">
            {result.error}
          </p>
        )}

        {(result.status === 'done' || result.status === 'timeout') &&
          result.elapsed_ms != null && (
            <p className="mt-8 border-t border-ink-800 pt-4 text-[11px] text-ink-600">
              {result.model} · {(result.elapsed_ms / 1000).toFixed(1)}s
              {result.output_tokens != null && (
                <>
                  {' · '}
                  {t('panel.tokens', {
                    in: result.input_tokens ?? 0,
                    out: result.output_tokens,
                  })}
                  {' · '}
                  <span className="text-ink-400">
                    {formatCost(
                      costOf(result.model, result.input_tokens ?? 0, result.output_tokens)
                    )}
                  </span>
                </>
              )}
            </p>
          )}

        {/* Room for the floating control so it never covers the last line. */}
        {showFollow && <div className="h-12" />}
      </div>

      {showFollow && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3">
          <button
            onClick={() => {
              const next = !follow;
              setFollow(next);
              if (next) toBottom(true);
            }}
            className={[
              'pointer-events-auto flex items-center gap-1.5 rounded-full px-3.5 py-1.5',
              'text-[11px] font-medium shadow-lg backdrop-blur transition',
              follow
                ? 'bg-ink-800/90 text-ink-200 ring-1 ring-ink-600'
                : 'bg-ink-850/90 text-ink-400 ring-1 ring-ink-700 hover:text-ink-100',
            ].join(' ')}
            title={follow ? t('panel.followOff') : t('panel.followOn')}
          >
            {follow ? (
              <>
                <span
                  className="h-1.5 w-1.5 animate-pulse-bar rounded-full"
                  style={{ backgroundColor: cfg.color }}
                />
                {t('panel.following')}
              </>
            ) : (
              <>↓ {atBottom ? t('panel.follow') : t('panel.jumpToNewest')}</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
