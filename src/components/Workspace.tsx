'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CaptureCard from './CaptureCard';
import HistoryList from './HistoryList';
import ModeTabs from './ModeTabs';
import ResultPanel from './ResultPanel';
import { DEFAULT_MODE, MODE_ORDER, MODES } from '@/lib/modes';
import { compressImage, deviceLabel, uuid } from '@/lib/image';
import { useI18n } from '@/lib/i18n';
import { getBrowserClient } from '@/lib/supabase/client';
import { imagePathsOf, type Mode, type Result, type Submission } from '@/lib/types';

interface Props {
  userId: string;
  email: string;
}

export default function Workspace({ userId, email }: Props) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const { t, locale, setLocale } = useI18n();

  /**
   * Fire a solve pass. The answer comes back over realtime, so the UI is
   * identical whether this device started the job or another one did, and the
   * route claims the row atomically so duplicate kicks are harmless.
   *
   * If the request never lands, say so. This used to swallow the failure, and
   * a misconfigured server looked exactly like a slow one: the tab sat on
   * "queued" forever with nothing anywhere to explain it. Only a row still
   * `queued` is marked — anything further along belongs to a run in flight.
   */
  const kick = useCallback(
    async (submissionId: string, mode: Mode) => {
      let message: string | null = null;

      try {
        const res = await fetch('/api/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionId, mode }),
        });
        if (res.ok) return;
        const body = await res.json().catch(() => ({}) as { error?: string });
        message = body.error ?? `The solver returned HTTP ${res.status}`;
      } catch (err) {
        message = err instanceof Error ? err.message : 'Could not reach the solver';
      }

      await supabase
        .from('results')
        .update({ status: 'error', error: message, updated_at: new Date().toISOString() })
        .eq('submission_id', submissionId)
        .eq('mode', mode)
        .eq('status', 'queued');
    },
    [supabase]
  );

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  // Filled in by CaptureCard. The capture controls live in the left column and
  // a four-solution answer is long, so without this the way to start the next
  // problem is a long scroll back up.
  const openPickerRef = useRef<(() => void) | null>(null);

  function newProblem() {
    setHistoryOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    openPickerRef.current?.();
  }

  // Escape closes the drawer, and the body does not scroll behind it.
  useEffect(() => {
    if (!historyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHistoryOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [historyOpen]);

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

        // Nothing is resumed here on purpose. A queued row is one nobody has
        // pressed a button for, and starting it on page load would spend money
        // the user did not ask to spend. If a request was lost — phone locked
        // before it went out — the tab still offers the button.
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, kick]);

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
    async (files: File[], mode: Mode) => {
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

        // A row per mode. The one you pressed starts now; the other sits
        // queued on its tab with its price on it, for whenever you want it.
        const { error: resErr } = await supabase.from('results').insert(
          MODE_ORDER.map((m) => ({ submission_id: id, user_id: userId, mode: m }))
        );
        if (resErr) throw resErr;

        // Optimistic — realtime will confirm a beat later.
        setSubmissions((prev) => [submission, ...prev]);
        setActiveId(id);
        setActiveMode(mode);
        setUploading(false);

        kick(id, mode);
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
          {/* The drawer trigger takes the logo's place on a phone, where the
              logo was decoration and the history was unreachable. */}
          {submissions.length > 0 && (
            <button
              onClick={() => setHistoryOpen(true)}
              aria-label={t('history.open')}
              className="-ml-1 rounded-lg px-2 py-1.5 text-ink-300 transition hover:text-ink-100 lg:hidden"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M2 4h12M2 8h12M2 12h12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}

          <h1 className="text-sm font-semibold tracking-tight">Coding Helper</h1>

          <button
            onClick={newProblem}
            disabled={uploading}
            className="ml-3 flex items-center gap-1.5 rounded-lg bg-accent-medium/15 px-3 py-1.5 text-xs font-semibold text-accent-medium ring-1 ring-accent-medium/40 transition hover:bg-accent-medium/25 disabled:opacity-50"
          >
            <span className="text-sm leading-none">+</span>
            {t('app.newProblem')}
          </button>

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
            openPickerRef={openPickerRef}
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

        </div>
      </div>

      {/* ------------------------------------------- history, on a phone -- */}
      {/* On a narrow screen the list used to sit under the answer, which with
          a ladder of solutions put it thousands of pixels down. It slides in
          from the left instead, over the answer, and closes when you pick. */}
      <div
        className={[
          'fixed inset-0 z-30 lg:hidden',
          historyOpen ? '' : 'pointer-events-none',
        ].join(' ')}
        aria-hidden={!historyOpen}
      >
        <div
          onClick={() => setHistoryOpen(false)}
          className={[
            'absolute inset-0 bg-ink-950/70 backdrop-blur-sm transition-opacity duration-200',
            historyOpen ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        />
        <div
          className={[
            'absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col',
            'border-r border-ink-800 bg-ink-950 shadow-2xl',
            'transition-transform duration-200 ease-out',
            historyOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-ink-400 uppercase">
              {t('history.heading')}
            </h2>
            <button
              onClick={() => setHistoryOpen(false)}
              aria-label={t('history.close')}
              className="rounded-lg px-2 py-1 text-sm text-ink-400 transition hover:text-ink-100"
            >
              ✕
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <HistoryList
              submissions={submissions}
              resultsBySub={resultsBySub}
              activeId={activeId}
              onSelect={(id) => {
                setActiveId(id);
                setHistoryOpen(false);
              }}
              bare
            />
          </div>
        </div>
      </div>
    </div>
  );
}
