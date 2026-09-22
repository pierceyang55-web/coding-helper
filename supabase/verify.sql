-- ============================================================================
-- Coding Helper — setup check
-- Run this in the Supabase SQL Editor. Every row should say PASS.
-- ============================================================================

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
            then 'PASS' else 'FAIL — cross-device sync will not work' end

union all
select 'storage bucket "problems"',
       case when exists (select 1 from storage.buckets where id = 'problems')
            then 'PASS' else 'FAIL — run storage.sql' end

union all
select 'bucket is private',
       case when exists (select 1 from storage.buckets
                         where id = 'problems' and public = false)
            then 'PASS' else 'FAIL — set the bucket to private' end

union all
select 'storage policies',
       case when (select count(*) from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and policyname like 'own photos%') = 3
            then 'PASS' else 'FAIL — see the dashboard fallback in storage.sql' end;
