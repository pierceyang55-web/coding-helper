-- ============================================================================
-- Coding Helper — STEP 2 of 2: the private photo bucket
--
-- Run this as its own query, AFTER schema.sql.
-- Safe to re-run.
--
-- If the policy section reports a permission problem, that is normal on some
-- projects — storage.objects is owned by a role you may not control. The
-- fallback is four clicks in the dashboard; see the bottom of this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The bucket. Private: nothing is readable without a signed URL.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('problems', 'problems', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Access: each user can only touch files under a folder named after their
--    own user id. The app uploads to `<user_id>/<submission_id>.jpg`.
--
--    Wrapped so a privilege error degrades to a NOTICE instead of rolling the
--    bucket back.
-- ---------------------------------------------------------------------------
do $$
begin
  drop policy if exists "own photos read"   on storage.objects;
  drop policy if exists "own photos write"  on storage.objects;
  drop policy if exists "own photos delete" on storage.objects;

  create policy "own photos read" on storage.objects
    for select to authenticated using (
      bucket_id = 'problems' and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy "own photos write" on storage.objects
    for insert to authenticated with check (
      bucket_id = 'problems' and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy "own photos delete" on storage.objects
    for delete to authenticated using (
      bucket_id = 'problems' and (storage.foldername(name))[1] = auth.uid()::text
    );

  raise notice 'Storage policies created.';
exception
  when insufficient_privilege then
    raise notice 'No permission to manage policies on storage.objects. Create them in the dashboard instead — instructions are at the bottom of storage.sql.';
  when others then
    raise notice 'Storage policy setup failed: %. Create them in the dashboard instead.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Check what you ended up with.
-- ---------------------------------------------------------------------------
select id, name, public from storage.buckets where id = 'problems';

select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'own photos%';

-- ============================================================================
-- DASHBOARD FALLBACK — only needed if the policy block above raised a notice.
--
-- Storage -> Policies -> storage.objects -> New policy -> "For full customization"
-- Create three policies, all with Target roles = authenticated:
--
--   Name: own photos read     Operation: SELECT
--   USING expression:
--     bucket_id = 'problems' AND (storage.foldername(name))[1] = auth.uid()::text
--
--   Name: own photos write    Operation: INSERT
--   WITH CHECK expression:
--     bucket_id = 'problems' AND (storage.foldername(name))[1] = auth.uid()::text
--
--   Name: own photos delete   Operation: DELETE
--   USING expression:
--     bucket_id = 'problems' AND (storage.foldername(name))[1] = auth.uid()::text
--
-- And if even the bucket insert failed: Storage -> New bucket -> name it
-- exactly `problems`, leave "Public bucket" OFF, Save.
-- ============================================================================
