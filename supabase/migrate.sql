-- ============================================================================
-- Coding Helper — migration for an existing project
--
-- Adds: several photos per problem, the answer language, and per-pass token
-- counts so the UI can show what each run actually cost.
--
-- Run this once in the Supabase SQL Editor. A project created from the current
-- schema.sql already has all of it. Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Several photos per problem.
--
--    `image_path` stays as the first photo so rows written by the old client
--    keep working and the NOT NULL constraint still holds. Readers use
--    coalesce(image_paths, array[image_path]).
-- ---------------------------------------------------------------------------
alter table public.submissions
  add column if not exists image_paths text[];

update public.submissions
   set image_paths = array[image_path]
 where image_paths is null;

-- ---------------------------------------------------------------------------
-- 2. The language the answer is written in, captured at upload time so a
--    re-run from another device reproduces the same answer.
-- ---------------------------------------------------------------------------
alter table public.submissions
  add column if not exists answer_locale text not null default 'zh-TW';

-- ---------------------------------------------------------------------------
-- 3. Token counts, reported by the API and written when a pass finishes.
--    Cost is derived in the client from these plus the model name.
-- ---------------------------------------------------------------------------
alter table public.results
  add column if not exists input_tokens  integer,
  add column if not exists output_tokens integer;

-- ---------------------------------------------------------------------------
-- 4. Check it worked — every row should say PASS.
-- ---------------------------------------------------------------------------
with expected(tbl, col) as (
  values ('submissions', 'image_paths'),
         ('submissions', 'answer_locale'),
         ('results',     'input_tokens'),
         ('results',     'output_tokens')
)
select e.tbl || '.' || e.col as check,
       case when exists (
              select 1 from information_schema.columns c
               where c.table_schema = 'public'
                 and c.table_name   = e.tbl
                 and c.column_name  = e.col
            )
            then 'PASS' else 'FAIL' end as result
  from expected e

union all
select 'no unbackfilled photos',
       case when (select count(*) from public.submissions where image_paths is null) = 0
            then 'PASS' else 'FAIL' end;

-- ---------------------------------------------------------------------------
-- Note on modes: `results.mode` still allows 'fast' so old rows survive. The
-- app no longer creates them and the Fast tab is gone from the UI.
-- ---------------------------------------------------------------------------
