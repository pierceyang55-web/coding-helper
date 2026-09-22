'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CaptureCard from './CaptureCard';
import HistoryList from './HistoryList';
import ModeTabs from './ModeTabs';
import ResultPanel from './ResultPanel';
import { AUTO_MODES, DEFAULT_MODE, MODE_ORDER, MODES } from '@/lib/modes';
import { compressImage, deviceLabel, uuid } from '@/lib/image';
import { useI18n } from '@/lib/i18n';
import { getBrowserClient } from '@/lib/supabase/client';
import { imagePathsOf, type Mode, type Result, type Submission } from '@/lib/types';

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
  const { t, locale, setLocale } = useI18n();

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [resultsBySub, setResultsBySub] = useState<
    Record<string, Partial<Record<Mode, Result>>>
  >({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<Mode>(DEFAULT_MODE);
  const [language, setLanguage] = useState('python');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
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
        // AUTO_MODES only: a queued Fine is one the user has not asked for yet,
        // and resuming it here would quietly spend the money they avoided.
        for (const s of list.slice(0, 5)) {
          for (const mode of AUTO_MODES) {
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
            setActiveMode(DEFAULT_MODE);
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

  // Joined into one string so a re-render that only refreshed the title (which
  // replaces the submission object) doesn't re-sign every photo.
  const activePaths = activeSubmission ? imagePathsOf(activeSubmission) : [];
  const pathsKey = activePaths.join('|');

  useEffect(() => {
    let cancelled = false;
    setImageUrls([]);
    setShowPhoto(false);

    const paths = pathsKey ? pathsKey.split('|') : [];
    if (!paths.length) return;

    (async () => {
      const { data } = await supabase.storage.from('problems').createSignedUrls(paths, 3600);
      if (cancelled) return;
      // Keep the user's page order rather than whatever the API returns.
      const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
      setImageUrls(paths.map((p) => byPath.get(p)).filter((u): u is string => !!u));
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, pathsKey]);

  // -------------------------------------------------------------- upload --
  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setUploading(true);
      setUploadError(null);

      try {
        const id = uuid();

        // Compress and upload every page in parallel — on a phone the upload,
        // not the compression, is the wall, and these are independent objects.
        const paths = await Promise.all(
          files.map(async (file, i) => {
            const { blob } = await compressImage(file);
            const path = `${userId}/${id}-${i}.jpg`;
            const { error: upErr } = await supabase.storage
              .from('problems')
              .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
            if (upErr) throw upErr;
            return path;
          })
        );

        const submission: Submission = {
          id,
          user_id: userId,
          image_path: paths[0],
          image_paths: paths,
          language,
          answer_locale: locale,
          title: null,
          device_label: deviceLabel(),
          created_at: new Date().toISOString(),
        };

        const { error: subErr } = await supabase.from('submissions').insert({
          id,
          user_id: userId,
          image_path: paths[0], // first page, for the pre-migration column
          image_paths: paths,
          language,
          answer_locale: locale,
          device_label: submission.device_label,
        });
        if (subErr) throw subErr;

        // A row per mode either way — Fine sits queued until it is asked for.
        const { error: resErr } = await supabase.from('results').insert(
          MODE_ORDER.map((m) => ({ submission_id: id, user_id: userId, mode: m }))
        );
        if (resErr) throw resErr;

        // Optimistic — realtime will confirm a beat later.
        setSubmissions((prev) => [submission, ...prev]);
        setActiveId(id);
        setActiveMode(DEFAULT_MODE);
        setUploading(false);

        for (const mode of AUTO_MODES) kick(id, mode);
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

          {/* Interface language only — switching costs nothing. The answer's
              language is fixed per submission, at upload. */}
          <button
            onClick={() => setLocale(locale === 'zh-TW' ? 'en' : 'zh-TW')}
            className="ml-auto rounded-lg px-2.5 py-1 text-xs font-medium text-ink-300 ring-1 ring-ink-700 transition hover:text-ink-100 sm:ml-0"
            title={locale === 'zh-TW' ? 'Switch to English' : '切換為繁體中文'}
          >
            {t('locale.switch')}
          </button>

          <button
            onClick={signOut}
            className="rounded-lg px-2.5 py-1 text-xs text-ink-400 ring-1 ring-ink-800 transition hover:text-ink-100"
          >
            {t('app.signOut')}
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[320px_1fr]">
        {/* ------------------------------------------------------ left -- */}
        <div className="space-y-4">
          <CaptureCard
            language={language}
            onLanguageChange={setLanguage}
            onSubmit={handleFiles}
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
                  ? activeSubmission.title ?? t('problem.reading')
                  : loading
                    ? t('problem.loading')
                    : t('problem.none')}
              </p>
              {activeSubmission && (
                <p className="mt-0.5 text-[11px] text-ink-600">
                  {activeSubmission.language} ·{' '}
                  {new Date(activeSubmission.created_at).toLocaleTimeString()}
                  {activeSubmission.device_label ? ` · from ${activeSubmission.device_label}` : ''}
                </p>
              )}
            </div>

            {imageUrls.length > 0 && (
              <button
                onClick={() => setShowPhoto((v) => !v)}
                className="relative shrink-0 overflow-hidden rounded-lg ring-1 ring-ink-700 transition hover:ring-ink-600"
                title={
                  imageUrls.length > 1
                    ? t('problem.showPhotos', { n: imageUrls.length })
                    : t('problem.showPhoto')
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrls[0]} alt="Captured problem" className="h-10 w-14 object-cover" />
                {imageUrls.length > 1 && (
                  <span className="absolute bottom-0 right-0 rounded-tl bg-ink-950/85 px-1 text-[10px] font-medium text-ink-200">
                    {imageUrls.length}
                  </span>
                )}
              </button>
            )}

            {activeSubmission && (
              <button
                onClick={() => rerun(activeMode)}
                className="shrink-0 rounded-lg px-2.5 py-1 text-xs text-ink-400 ring-1 ring-ink-800 transition hover:text-ink-100"
                title={t('problem.rerun', { mode: MODES[activeMode].label })}
              >
                ↻
              </button>
            )}
          </div>

          {showPhoto && imageUrls.length > 0 && (
            <div
              className={
                imageUrls.length > 1
                  ? 'flex gap-3 overflow-x-auto rounded-2xl ring-1 ring-ink-800'
                  : ''
              }
            >
              {imageUrls.map((url, i) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={url}
                  src={url}
                  alt={`Captured problem, page ${i + 1}`}
                  className={[
                    'max-h-[45vh] rounded-2xl object-contain',
                    imageUrls.length > 1 ? 'w-auto shrink-0' : 'w-full ring-1 ring-ink-800',
                  ].join(' ')}
                />
              ))}
            </div>
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
              onRun={() => rerun(activeMode)}
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
