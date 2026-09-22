'use client';

import { MODE_ORDER } from '@/lib/modes';
import { useI18n } from '@/lib/i18n';
import type { Mode, Result, Submission } from '@/lib/types';

interface Props {
  submissions: Submission[];
  resultsBySub: Record<string, Partial<Record<Mode, Result>>>;
  activeId: string | null;
  onSelect: (id: string) => void;
}

const DOT: Record<string, string> = {
  queued: 'bg-ink-700',
  streaming: 'bg-sky-400 animate-pulse-bar',
  done: 'bg-emerald-400',
  timeout: 'bg-amber-400',
  error: 'bg-red-400',
};

function when(iso: string, t: (k: 'history.justNow' | 'history.minutes' | 'history.hours', v?: Record<string, number>) => string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return t('history.justNow');
  if (diff < 3600) return t('history.minutes', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('history.hours', { n: Math.floor(diff / 3600) });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function HistoryList({ submissions, resultsBySub, activeId, onSelect }: Props) {
  const { t } = useI18n();
  if (!submissions.length) return null;

  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-2 backdrop-blur">
      <h2 className="px-2 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
        {t('history.heading')}
      </h2>
      <ul className="max-h-[46vh] space-y-0.5 overflow-y-auto lg:max-h-[calc(100vh-25rem)]">
        {submissions.map((s) => {
          const rs = resultsBySub[s.id] ?? {};
          const active = s.id === activeId;
          return (
            <li key={s.id}>
              <button
                onClick={() => onSelect(s.id)}
                className={[
                  'w-full rounded-xl px-3 py-2.5 text-left transition',
                  active ? 'bg-ink-800 ring-1 ring-ink-700' : 'hover:bg-ink-850',
                ].join(' ')}
              >
                <p className="truncate text-[13px] font-medium text-ink-100">
                  {s.title ?? t('history.reading')}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="flex gap-1">
                    {MODE_ORDER.map((m) => (
                      <span
                        key={m}
                        title={`${m}: ${rs[m]?.status ?? 'queued'}`}
                        className={`h-1.5 w-1.5 rounded-full ${DOT[rs[m]?.status ?? 'queued']}`}
                      />
                    ))}
                  </span>
                  <span className="text-[11px] text-ink-600">
                    {when(s.created_at, t)}
                    {s.device_label ? ` · ${s.device_label}` : ''}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
