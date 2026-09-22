# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication

The user writes in Traditional Chinese (繁體中文). Reply mainly in Traditional Chinese, keep key technical terms in English, and write code, identifiers and code comments in English.

## Commands

```bash
npm run dev          # Next.js dev server on :3000 (Turbopack)
npm run dev:lan      # bind 0.0.0.0 so a phone on the LAN can reach it
npm run build        # production build
npm run typecheck    # tsc --noEmit — the only static check; there is no lint script and no test suite
```

`setup-env.ps1` interactively writes `.env.local` (keep that script pure ASCII — PowerShell 5.1 misreads UTF-8 without BOM). Env var names are in `ENV_TEMPLATE.txt`; `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true` (strict string compare) shows the Google button on `/login`. Changing any env var requires restarting the dev server.

## Architecture

A phone photographs a LeetCode-style problem; three Claude passes (fast / medium / fine) run in parallel and stream live to every device signed into the same account. There is no socket server — **Postgres is the single source of truth and Supabase Realtime is the transport.**

Flow (see [src/components/Workspace.tsx](src/components/Workspace.tsx) and [src/app/api/solve/route.ts](src/app/api/solve/route.ts)):

1. Client compresses the image (`src/lib/image.ts`, 1600px JPEG), uploads to the private `problems` storage bucket at `{userId}/{uuid}.jpg`, inserts a `submissions` row, then inserts three `results` rows with `status='queued'`.
2. Client fires `POST /api/solve { submissionId, mode }` once per mode, **never awaited** (`kick()`). Results arrive only via realtime, so the UI is identical whether this device or another started the job.
3. The route **claims the row atomically** with `UPDATE ... WHERE status='queued'`. Zero rows updated means another device already claimed it — duplicate kicks are harmless by design. On load, `Workspace` re-kicks any still-`queued` results for the 5 newest submissions; this relies on that lock.
4. The route downloads the photo with the service-role client, streams from Anthropic, and flushes accumulated text into `results.content` at most every `FLUSH_MS` (400ms). An `AbortController` enforces each mode's `budgetMs`; on abort, partial text is kept and status becomes `timeout` (or `error` if nothing arrived).
5. The first pass to finish whose output starts with `TITLE: ...` sets `submissions.title` (only if still null). `ResultPanel` strips that line before rendering.
6. `Workspace` subscribes to `postgres_changes` on both tables filtered by `user_id`; an INSERT on `submissions` from another device auto-selects it.

Result status lifecycle: `queued → streaming → done | timeout | error`. Re-run (↻) resets a row to `queued` from the client, then kicks.

### Where things live

- **[src/lib/modes.ts](src/lib/modes.ts)** — single place to tune models, `budgetMs`, `maxTokens`, `thinking`/`effort`, per-mode system prompts, and accent colors. `MODE_ORDER` controls which modes auto-start. Mode keys (`fast|medium|fine`) are also enforced by a CHECK constraint in `supabase/schema.sql` and the `Mode` type in `src/lib/types.ts` — change all three together.
- `src/lib/types.ts` — `Submission` / `Result` types mirror the SQL tables; keep in sync with `supabase/schema.sql`.
- `src/lib/supabase/` — `env.ts` accepts both old and new Supabase key names (anon/publishable, service_role/secret); the `process.env.NEXT_PUBLIC_*` reads must stay literal so Next inlines them. `client.ts` = singleton browser client (avoids duplicate realtime channels). `server.ts` = cookie-based RLS client + `createServiceSupabase()` (server-only, bypasses RLS). `session.ts` = session refresh + redirect logic.
- **[proxy.ts](proxy.ts)** — Next.js 16 renamed `middleware` → `proxy`. Refreshes the session, redirects unauthenticated users to `/login?next=...`. Its matcher **excludes `/api/`**; the solve route does its own `auth.getUser()` check and verifies submission ownership before using the service-role client.
- Routes: `/` → redirects to `/app`; `/app` (server component, renders `Workspace`); `/login` (magic link + optional Google OAuth); `/auth/callback` (code exchange).
- `supabase/*.sql` — run in the Supabase SQL Editor as **three separate queries** in order: `schema.sql`, `storage.sql`, `verify.sql` (all rows should read PASS). They are split because one editor tab = one transaction. RLS scopes every row to `auth.uid() = user_id`; tables use `replica identity full` and are in the `supabase_realtime` publication.

### Conventions and gotchas

- Anthropic request params are built as `Record<string, unknown>` and cast to `any`, because `thinking: { type: 'adaptive' }` and `output_config: { effort }` may be newer than the installed SDK types. Keep that pattern when adding API fields.
- `route.ts` sets `runtime = 'nodejs'` and `maxDuration = 300`; fine mode's 240s budget must stay under that.
- Styling is Tailwind CSS v4 with tokens defined in `@theme` in `src/app/globals.css` (`ink-*` greys, `accent-fast|medium|fine`). Dark-only UI.
- Path alias `@/*` → `src/*`.
- `uuid()` in `image.ts` falls back from `crypto.randomUUID()` because it's missing on non-secure (LAN http) contexts; same reason clipboard copy may fail over LAN.
- README mentions `.env.local.example`, but the actual template file is `ENV_TEMPLATE.txt`.
- `GOOGLE-AUTH.md` and `TESTING.md` are step-by-step setup/testing guides for the human operator.
