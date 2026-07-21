-- Adds optional image attachments to events. Run this in the Supabase SQL
-- Editor AFTER 0004_complete_schema_fix.sql (0004 creates the `events`
-- table itself -- if it hasn't actually taken effect yet, run it first
-- or this will fail with "relation public.events does not exist").
--
-- NOTE: as of this file being written, live verification via the REST API
-- still shows 0004/0005 have not taken effect on the project, despite
-- being reported as run successfully twice. Before running this, please
-- self-verify in the SAME SQL Editor session with:
--   select column_name from information_schema.columns where table_name = 'tasks';
-- If that doesn't list `assignee`, `status`, etc., 0004 has not actually
-- applied yet and needs to be re-run (and investigated) before this file.

alter table public.events add column if not exists image_url text;

-- Separate bucket from task-images, same permissive pattern.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-images',
  'event-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "event-images: public read" on storage.objects;
create policy "event-images: public read" on storage.objects
  for select to public
  using (bucket_id = 'event-images');

drop policy if exists "event-images: anon upload" on storage.objects;
create policy "event-images: anon upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'event-images');

drop policy if exists "event-images: anon delete" on storage.objects;
create policy "event-images: anon delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'event-images');
