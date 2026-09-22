import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { MODES } from '@/lib/modes';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import type { Mode } from '@/lib/types';

export const runtime = 'nodejs';
// Fine mode can think for a few minutes. Vercel caps this per plan — see README.
export const maxDuration = 300;

/** How often streamed text is flushed to Postgres (and therefore to every device). */
const FLUSH_MS = 400;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  let body: { submissionId?: string; mode?: Mode };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { submissionId, mode } = body;
  if (!submissionId || !mode || !(mode in MODES)) {
    return NextResponse.json({ error: 'submissionId and a valid mode are required' }, { status: 400 });
  }

  const cfg = MODES[mode];

  // --- auth: the caller must own this submission --------------------------
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const admin = createServiceSupabase();

  const { data: submission, error: subErr } = await admin
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .eq('user_id', user.id)
    .single();

  if (subErr || !submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  const startedAt = Date.now();
  const touch = (patch: Record<string, unknown>) =>
    admin
      .from('results')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('submission_id', submissionId)
      .eq('mode', mode);

  // --- claim the row atomically -------------------------------------------
  // `status = 'queued'` in the WHERE clause is the lock: whichever device asks
  // first flips it to 'streaming', everyone else gets zero rows and backs off.
  // Without this, a phone and a laptop firing the same job would both run it.
  const { data: claimed, error: claimErr } = await admin
    .from('results')
    .update({
      status: 'streaming',
      model: cfg.model,
      started_at: new Date(startedAt).toISOString(),
      content: '',
      error: null,
      elapsed_ms: null,
      updated_at: new Date().toISOString(),
    })
    .eq('submission_id', submissionId)
    .eq('mode', mode)
    .eq('status', 'queued')
    .select('id');

  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'already running or finished' });
  }

  // --- fetch the photo ----------------------------------------------------
  const { data: file, error: dlErr } = await admin.storage
    .from('problems')
    .download(submission.image_path);

  if (dlErr || !file) {
    await touch({ status: 'error', error: `Could not read the photo: ${dlErr?.message ?? 'missing'}` });
    return NextResponse.json({ error: 'Photo unavailable' }, { status: 500 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mediaType = (file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg') as
    | 'image/jpeg'
    | 'image/png'
    | 'image/webp'
    | 'image/gif';

  // --- stream from Claude, flushing into Postgres as it goes --------------
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.budgetMs);

  let text = '';
  let flushed = '';
  let lastFlush = 0;
  let timedOut = false;

  const flush = async (force = false) => {
    const now = Date.now();
    if (!force && (now - lastFlush < FLUSH_MS || text === flushed)) return;
    lastFlush = now;
    flushed = text;
    await touch({ content: text });
  };

  // `thinking` / `output_config` are newer API fields; cast keeps us compatible
  // with whichever SDK minor version is installed.
  const params: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    system: cfg.systemPrompt(submission.language || 'python'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: bytes.toString('base64') },
          },
          {
            type: 'text',
            text:
              `Solve the problem in this photo. Target language: ${submission.language || 'python'}. ` +
              `Follow your mode's output format exactly.`,
          },
        ],
      },
    ],
  };

  if (cfg.thinking) {
    params.thinking = { type: 'adaptive' };
    if (cfg.effort) params.output_config = { effort: cfg.effort };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = anthropic.messages.stream(params as any, { signal: controller.signal });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        'delta' in event &&
        event.delta.type === 'text_delta'
      ) {
        text += event.delta.text;
        await flush();
      }
    }
  } catch (err) {
    const aborted =
      controller.signal.aborted ||
      (err instanceof Error && /abort/i.test(err.name + err.message));

    if (aborted) {
      timedOut = true;
    } else {
      clearTimeout(timer);
      const message = err instanceof Error ? err.message : 'Unknown error';
      await touch({
        status: 'error',
        error: message,
        content: text,
        elapsed_ms: Date.now() - startedAt,
      });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  clearTimeout(timer);

  const elapsed = Date.now() - startedAt;
  const finalStatus = timedOut ? (text.trim() ? 'timeout' : 'error') : 'done';

  await touch({
    status: finalStatus,
    content: text,
    elapsed_ms: elapsed,
    error: finalStatus === 'error' ? `No output before the ${cfg.budgetMs / 1000}s limit` : null,
  });

  // --- name the submission from the first pass that reads the title -------
  const titleMatch = text.match(/^\s*TITLE:\s*(.+)$/m);
  if (titleMatch && !submission.title) {
    await admin
      .from('submissions')
      .update({ title: titleMatch[1].trim().slice(0, 120) })
      .eq('id', submissionId)
      .is('title', null);
  }

  return NextResponse.json({ ok: true, status: finalStatus, elapsed_ms: elapsed });
}
