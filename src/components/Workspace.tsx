'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CaptureCard from './CaptureCard';
import HistoryList from './HistoryList';
import ModeTabs from './ModeTabs';
import ResultPanel from './ResultPanel';
import { MODE_ORDER, MODES } from '@/lib/modes';
import { compressImage, deviceLabel, uuid } from '@/lib/image';
import { getBrowserClient } from '@/lib/supabase/client';
import type { Mode, Result, Submission } from '@/lib/types';

interface Props {
  userId: string;
  email: string;
}

/**
 * Fire a solve pass. Never awaited: the answer comes back over realtime, so the
 * UI is identical whether this device started the job or another one did.
 * The route claims the row atomically, so duplicate kicks are harmless.
 */
function kick(submissionId: string, mode: Mode) {
  fetch('/api/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submissionId, mode }),
  }).catch(() => {});
}

export default function Workspace({ userId, email }: Props) {
  const supabase = useMemo(() => getBrowserClient(), []);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [resultsBySub, setResultsBySub] = useState<
    Record<string, Partial<Record<Mode, Result>>>
  >({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<Mode>('fast');
  const [language, setLanguage] = useState('python');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  // ---------------------------------------------------------------- load --
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: subs } = await supabase
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (cancelled) return;
      const list = (subs ?? []) as Submission[];
      setSubmissions(list);

      if (list.length) {
        const { data: res } = await supabase
          .from('results')
          .select('*')
          .in(
            'submission_id',
            list.map((s) => s.id)
          );

        if (cancelled) return;
        const map: Record<string, Partial<Record<Mode, Result>>> = {};
        for (const r of (res ?? []) as Result[]) {
          (map[r.submission_id] ??= {})[r.mode] = r;
        }
        setResultsBySub(map);
        setActiveId((cur) => cur ?? list[0].id);

        // Resume anything that never started — e.g. you took the photo, locked
        // the phone before the request went out, and opened your laptop later.
        for (const s of list.slice(0, 5)) {
          for (const mode of MODE_ORDER) {
            if ((map[s.id]?.[mode]?.status ?? 'queued') === 'queued') kick(s.id, mode);
          }
        }
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // ------------------------------------------------------------ realtime --
  useEffect(() => {
    const channel = supabase
      .channel('coding-helper-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submissions', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as Submission;
          if (!row?.id) return;
          setSubmissions((prev) => {
            const rest = prev.filter((s) => s.id !== row.id);
            return [row, ...rest].sort((a, b) => b.created_at.localeCompare(a.created_at));
          });
          // A photo taken on another device jumps straight to the front here.
          if (payload.eventType === 'INSERT' && activeIdRef.current !== row.id) {
            setActiveId(row.id);
            setActiveMode('fast');
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'results', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as Result;
          if (!row?.id) return;
          setResultsBySub((prev) => ({
            ...prev,
            [row.submission_id]: { ...(prev[row.submission_id] ?? {}), [row.mode]: row },
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  // ------------------------------------------------------- ticking clock --
  const activeResults = activeId ? resultsBySub[activeId] ?? {} : {};
  const anyStreaming = MODE_ORDER.some((m) => activeResults[m]?.status === 'streaming');

  useEffect(() => {
    if (!anyStreaming) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [anyStreaming]);

  // --------------------------------------------------- active photo url ---
  const activeSubmission = submissions.find((s) => s.id === activeId) ?? null;

  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);
    setShowPhoto(false);
    if (!activeSubmission) return;

    (async () => {
      const { data } = await supabase.storage
        .from('problems')
        .createSignedUrl(activeSubmission.image_path, 3600);
      if (!cancelled) setImageUrl(data?.signedUrl ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, activeSubmission]);

  // -------------------------------------------------------------- upload --
  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadError(null);

      try {
        const { blob } = await compressImage(file);
        const id = uuid();
        const path = `${userId}/${id}.jpg`;

        const { error: upErr } = await supabase.storage
          .from('problems')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;

        const submission: Submission = {
          id,
          user_id: userId,
          image_path: path,
          language,
          title: null,
          device_label: deviceLabel(),
          created_at: new Date().toISOString(),
        };

        const { error: subErr } = await supabase.from('submissions').insert({
          id,
          user_id: userId,
          image_path: path,
          language,
          device_label: submission.device_label,
        });
        if (subErr) throw subErr;

        const { error: resErr } = await supabase.from('results').insert(
          MODE_ORDER.map((m) => ({ submission_id: id, user_id: userId, mode: m }))
        );
        if (resErr) throw resErr;

        // Optimistic — realtime will confirm a beat later.
        setSubmissions((prev) => [submission, ...prev]);
        setActiveId(id);
        setActiveMode('fast');
        setUploading(false);

        // Three independent passes, all started at once.
        for (const mode of MODE_ORDER) kick(id, mode);
      } catch (err) {
        setUploading(false);
        setUploadError(err instanceof Error ? err.message : 'Upload failed');
      }
    },
    [language, supabase, userId]
  );

  // -------------------------------------------------------------- re-run --
  const rerun = useCallback(
    async (mode: Mode) => {
      if (!activeId) return;
      await supabase
        .from('results')
        .update({ status: 'queued', content: '', error: null, elapsed_ms: null })
        .eq('submission_id', activeId)
        .eq('mode', mode);

      kick(activeId, mode);
    },
    [activeId, supabase]
  );

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const activeResult = activeResults[activeMode];

  return (
    <div className="min-h-screen">
      {/* -------------------------------------------------------- header -- */}
      <header className="sticky top-0 z-20 border-b border-ink-800/80 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-fast/25 to-accent-fine/25 text-xs ring-1 ring-ink-700">
            ⌘
          </span>
          <h1 className="text-sm font-semibold tracking-tight">Coding Helper</h1>
          <span className="ml-auto hidden text-xs text-ink-600 sm:block">{email}</span>
          <button
            onClick={signOut}
            className="rounded-lg px-2.5 py-1 text-xs text-ink-400 ring-1 ring-ink-800 transition hover:text-ink-100"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[320px_1fr]">
        {/* ------------------------------------------------------ left -- */}
        <div className="space-y-4">
          <CaptureCard
            language={language}
            onLanguageChange={setLanguage}
            onFile={handleFile}
            busy={uploading}
            error={uploadError}
          />
          <div className="hidden lg:block">
            <HistoryList
              submissions={submissions}
              resultsBySub={resultsBySub}
              activeId={activeId}
              onSelect={setActiveId}
            />
          </div>
        </div>

        {/* ----------------------------------------------------- right -- */}
        <div className="flex min-h-[70vh] flex-col gap-3">
          {/* problem header */}
          <div className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/60 px-4 py-3 backdrop-blur">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-100">
                {activeSubmission
                  ? activeSubmission.title ?? 'Reading the photo…'
                  : loading
                    ? 'Loading…'
                    : 'Nothing captured yet'}
              </p>
              {activeSubmission && (
                <p className="mt-0.5 text-[11px] text-ink-600">
                  {activeSubmission.language} ·{' '}
                  {new Date(activeSubmission.created_at).toLocaleTimeString()}
                  {activeSubmission.device_label ? ` · from ${activeSubmission.device_label}` : ''}
                </p>
              )}
            </div>

            {imageUrl && (
              <button
                onClick={() => setShowPhoto((v) => !v)}
                className="shrink-0 overflow-hidden rounded-lg ring-1 ring-ink-700 transition hover:ring-ink-600"
                title="Show the original photo"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="Captured problem" className="h-10 w-14 object-cover" />
              </button>
            )}

            {activeSubmission && (
              <button
                onClick={() => rerun(activeMode)}
                className="shrink-0 rounded-lg px-2.5 py-1 text-xs text-ink-400 ring-1 ring-ink-800 transition hover:text-ink-100"
                title={`Run ${MODES[activeMode].label} again`}
              >
                ↻
              </button>
            )}
          </div>

          {showPhoto && imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageUrl}
              alt="Captured problem"
              className="max-h-[45vh] w-full rounded-2xl object-contain ring-1 ring-ink-800"
            />
          )}

          {/* the three tabs */}
          <ModeTabs
            results={activeResults}
            active={activeMode}
            onChange={setActiveMode}
            now={now}
          />

          {/* the answer */}
          <div className="flex-1 overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40 backdrop-blur">
            <ResultPanel
              mode={activeMode}
              result={activeResult}
              hasSubmission={!!activeSubmission}
            />
          </div>

          <div className="lg:hidden">
            <HistoryList
              submissions={submissions}
              resultsBySub={resultsBySub}
              activeId={activeId}
              onSelect={setActiveId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
