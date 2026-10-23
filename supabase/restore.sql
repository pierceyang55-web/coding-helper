-- ============================================================================
-- Coding Helper — bring an existing project up to the current schema.
--
-- Run this whole file as ONE query in the Supabase SQL Editor.
-- It adds the columns the newer app needs, then prints one checklist.
-- Every row of the result should read PASS. Safe to re-run.
--
-- Run supabase/storage.sql first if the `problems` bucket does not exist yet.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Several photos per problem.
--    `image_path` stays as page one so rows from the old client still resolve.
-- ---------------------------------------------------------------------------
alter table public.submissions
  add column if not exists image_paths text[];

update public.submissions
   set image_paths = array[image_path]
 where image_paths is null;

-- ---------------------------------------------------------------------------
-- 2. The language the answer is written in, fixed at upload so a re-run from
--    another device reproduces the same answer.
-- ---------------------------------------------------------------------------
alter table public.submissions
  add column if not exists answer_locale text not null default 'zh-TW';

-- ---------------------------------------------------------------------------
-- 3. Token counts, written when a pass finishes. Cost is derived from these.
-- ---------------------------------------------------------------------------
alter table public.results
  add column if not exists input_tokens  integer;

alter table public.results
  add column if not exists output_tokens integer;

-- ---------------------------------------------------------------------------
-- 4. One checklist. Every row should say PASS.
-- ---------------------------------------------------------------------------
select 'tables exist' as check,
       case when (select count(*) from information_schema.tables
                   where table_schema = 'public'
                     and table_name in ('submissions', 'results')) = 2
            then 'PASS' else 'FAIL — run schema.sql' end as result

union all
select 'row level security on',
       case when (select bool_and(rowsecurity) from pg_tables
                   where schemaname = 'public'
                     and tablename in ('submissions', 'results'))
            then 'PASS' else 'FAIL — run schema.sql' end

union all
select 'table policies',
       case when (select count(*) from pg_policies
                   where schemaname = 'public'
                     and tablename in ('submissions', 'results')) >= 2
            then 'PASS' else 'FAIL — run schema.sql' end

union all
select 'realtime publication',
       case when (select count(*) from pg_publication_tables
                   where pubname = 'supabase_realtime'
                     and schemaname = 'public'
                     and tablename in ('submissions', 'results')) = 2
            then 'PASS' else 'FAIL — add both tables under Database -> Publications' end

union all
select 'storage bucket "problems"',
       case when exists (select 1 from storage.buckets where id = 'problems')
            then 'PASS' else 'FAIL — run storage.sql' end

union all
select 'bucket is private',
       case when (select not public from storage.buckets where id = 'problems')
            then 'PASS' else 'FAIL — turn Public bucket OFF' end

union all
select 'storage policies',
       case when (select count(*) from pg_policies
                   where schemaname = 'storage'
                     and tablename = 'objects'
                     and policyname like 'own photos%') = 3
            then 'PASS' else 'FAIL — see the dashboard fallback in storage.sql' end

union all
select 'submissions.image_paths',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public'
                            and table_name = 'submissions'
                            and column_name = 'image_paths')
            then 'PASS' else 'FAIL' end

union all
select 'submissions.answer_locale',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public'
                            and table_name = 'submissions'
                            and column_name = 'answer_locale')
            then 'PASS' else 'FAIL' end

union all
select 'results.input_tokens',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public'
                            and table_name = 'results'
                            and column_name = 'input_tokens')
            then 'PASS' else 'FAIL' end

union all
select 'results.output_tokens',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public'
                            and table_name = 'results'
                            and column_name = 'output_tokens')
            then 'PASS' else 'FAIL' end;
