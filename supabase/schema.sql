-- ============================================================================
-- Coding Helper — STEP 1 of 2: tables, security, realtime
--
-- Supabase SQL Editor -> New query -> paste this whole file -> Run.
-- Then run supabase/storage.sql as a SEPARATE query.
--
-- These are split on purpose: the SQL Editor runs a file as one transaction, so
-- a permission error in the storage section would silently roll back the tables
-- too. Keeping them apart means a storage problem stays a storage problem.
--
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Submissions: one row per problem, carrying one or more photos of it.
--
--    Upgrading an existing project? Run supabase/migrate-multi-image.sql — it
--    adds `image_paths` and backfills it. This file is safe to re-run but will
--    not alter a table that already exists.
-- ---------------------------------------------------------------------------
create table if not exists public.submissions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  image_path    text not null,                 -- first photo; path inside the `problems` bucket
  image_paths   text[],                        -- every photo, in reading order
  language      text not null default 'python',-- the programming language to answer in
  answer_locale text not null default 'zh-TW', -- the human language of the explanation
  title         text,                          -- filled in by the first pass that reads the photo
  device_label  text,                          -- e.g. "iPhone" / "Windows" — display only
  created_at    timestamptz not null default now()
);

create index if not exists submissions_user_created_idx
  on public.submissions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Results: one row per mode per submission (medium / fine).
--    The solver streams into `content` so every signed-in device sees it live.
-- ---------------------------------------------------------------------------
create table if not exists public.results (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.submissions(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  mode           text not null check (mode in ('fast', 'medium', 'fine')),
  status         text not null default 'queued'
                 check (status in ('queued', 'streaming', 'done', 'timeout', 'error')),
  content        text not null default '',
  error          text,
  model          text,
  input_tokens   integer,                      -- reported by the API; drives the cost readout
  output_tokens  integer,                      -- includes thinking tokens, which are billed as output
  elapsed_ms     integer,
  started_at     timestamptz,
  updated_at     timestamptz not null default now(),
  unique (submission_id, mode)
);

create index if not exists results_submission_idx on public.results (submission_id);

-- ---------------------------------------------------------------------------
-- 3. Row level security — a user only ever sees their own rows, on any device.
-- ---------------------------------------------------------------------------
alter table public.submissions enable row level security;
alter table public.results     enable row level security;

drop policy if exists "own submissions" on public.submissions;
create policy "own submissions" on public.submissions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own results" on public.results;
create policy "own results" on public.results
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Realtime — this is what makes the phone -> computer sync instant.
-- ---------------------------------------------------------------------------
alter table public.submissions replica identity full;
alter table public.results     replica identity full;

do $$
declare
  t text;
begin
  foreach t in array array['submissions', 'results'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception
  when others then
    raise notice 'Could not add tables to supabase_realtime: %. Add them by hand under Database -> Publications.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Done. You should see submissions + results under Table Editor.
-- Now run supabase/storage.sql.
-- ---------------------------------------------------------------------------
