import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { MODES, answerLocaleRules } from '@/lib/modes';
import type { Locale } from '@/lib/i18n';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { imagePathsOf, type Mode } from '@/lib/types';

interface ImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    data: string;
  };
}

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

  // --- fetch every photo of the problem -----------------------------------
  const paths = imagePathsOf(submission);
  if (!paths.length) {
    await touch({ status: 'error', error: 'This submission has no photo attached' });
    return NextResponse.json({ error: 'Photo unavailable' }, { status: 500 });
  }

  let images: ImageBlock[];
  try {
    images = await Promise.all(
      paths.map(async (path, i) => {
        const { data: file, error: dlErr } = await admin.storage.from('problems').download(path);
        if (dlErr || !file) {
          throw new Error(
            `Could not read photo ${i + 1} of ${paths.length}: ${dlErr?.message ?? 'missing'}`
          );
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        const mediaType = (
          file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg'
        ) as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

        return {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mediaType,
            data: bytes.toString('base64'),
          },
        };
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Photo unavailable';
    await touch({ status: 'error', error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // --- stream from Claude, flushing into Postgres as it goes --------------
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.budgetMs);

  let text = '';
  let flushed = '';
  let lastFlush = 0;
  let timedOut = false;
  // Read off the stream rather than from the final message, so a pass cut short
  // by the timeout still reports what it burned.
  let inputTokens = 0;
  let outputTokens = 0;

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
    system:
      cfg.systemPrompt(submission.language || 'python') +
      answerLocaleRules((submission.answer_locale as Locale) || 'zh-TW'),
    messages: [
      {
        role: 'user',
        content: [
          // Numbering the pages keeps the model from re-reading an overlap as
          // a second, different problem.
          ...images.flatMap((img, i) =>
            images.length > 1
              ? [{ type: 'text' as const, text: `Page ${i + 1} of ${images.length}:` }, img]
              : [img]
          ),
          {
            type: 'text',
            text:
              (images.length > 1
                ? `The ${images.length} photos above are consecutive parts of ONE problem. `
                : '') +
              `Solve the problem in ${images.length > 1 ? 'these photos' : 'this photo'}. ` +
              `Target language: ${submission.language || 'python'}. ` +
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
      } else if (event.type === 'message_start') {
        inputTokens = event.message.usage?.input_tokens ?? 0;
      } else if (event.type === 'message_delta') {
        // Cumulative, so the last one seen is the total.
        outputTokens = event.usage?.output_tokens ?? outputTokens;
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
        input_tokens: inputTokens,
        output_tokens: outputTokens,
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
    input_tokens: inputTokens,
    output_tokens: outputTokens,
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
