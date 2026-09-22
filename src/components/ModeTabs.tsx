'use client';

import { MODES, MODE_ORDER } from '@/lib/modes';
import type { Mode, Result } from '@/lib/types';

interface Props {
  results: Partial<Record<Mode, Result>>;
  active: Mode;
  onChange: (m: Mode) => void;
  /** Ticking clock so streaming tabs count up live. */
  now: number;
}

function elapsedFor(r: Result | undefined, now: number): number | null {
  if (!r) return null;
  if (r.elapsed_ms != null) return r.elapsed_ms;
  if (r.status === 'streaming' && r.started_at) return now - new Date(r.started_at).getTime();
  return null;
}

function StatusChip({ r, now }: { r: Result | undefined; now: number }) {
  const ms = elapsedFor(r, now);
  const secs = ms == null ? null : (ms / 1000).toFixed(1);

  if (!r || r.status === 'queued')
    return <span className="text-[11px] tabular-nums text-ink-600">queued</span>;

  if (r.status === 'streaming')
    return (
      <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-ink-300">
        <span className="h-1.5 w-1.5 animate-pulse-bar rounded-full bg-current" />
        {secs}s
      </span>
    );

  if (r.status === 'done')
    return <span className="text-[11px] tabular-nums text-emerald-400">✓ {secs}s</span>;

  if (r.status === 'timeout')
    return (
      <span className="text-[11px] tabular-nums text-amber-400" title="Cut off at the time limit">
        ⏱ {secs}s
      </span>
    );

  return <span className="text-[11px] text-red-400">failed</span>;
}

export default function ModeTabs({ results, active, onChange, now }: Props) {
  return (
    <div className="flex gap-1 rounded-2xl border border-ink-800 bg-ink-900/60 p-1 backdrop-blur">
      {MODE_ORDER.map((mode) => {
        const cfg = MODES[mode];
        const r = results[mode];
        const isActive = active === mode;
        const ms = elapsedFor(r, now);
        const pct =
          r?.status === 'streaming' && ms != null
            ? Math.min(100, (ms / cfg.budgetMs) * 100)
            : null;

        return (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            className={[
              'relative flex-1 overflow-hidden rounded-xl px-3 py-2.5 text-left transition',
              isActive ? `ring-1 ${cfg.ring}` : 'hover:bg-ink-850',
            ].join(' ')}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={[
                  'text-sm font-semibold',
                  isActive ? cfg.accent : 'text-ink-300',
                ].join(' ')}
              >
                {cfg.label}
              </span>
              <StatusChip r={r} now={now} />
            </div>
            <p className="mt-0.5 hidden truncate text-[11px] text-ink-600 sm:block">
              {cfg.tagline}
            </p>

            {pct != null && (
              <span
                className="absolute bottom-0 left-0 h-[2px] transition-[width] duration-300"
                style={{ width: `${pct}%`, backgroundColor: cfg.color }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
