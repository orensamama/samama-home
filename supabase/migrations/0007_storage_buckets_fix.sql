-- Standalone fix: the table/column changes from 0005 and 0006 landed
-- correctly (tasks.image_url and events.image_url both exist), but the
-- storage bucket creation in those same files did not -- both
-- "task-images" and "event-images" buckets are missing when queried
-- directly via the Storage API. This isolates just the bucket +
-- policy creation so it's easy to re-run and see the exact error.
--
-- If this still doesn't work, paste back the exact red error text and
-- we'll dig in from there -- or as a fallback, create the two buckets
-- manually via Dashboard > Storage > New bucket (name exactly
-- "task-images" and "event-images", both Public, 5MB file size limit).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('task-images', 'task-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('event-images', 'event-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "task-images: public read" on storage.objects;
create policy "task-images: public read" on storage.objects
  for select to public
  using (bucket_id = 'task-images');

drop policy if exists "task-images: anon upload" on storage.objects;
create policy "task-images: anon upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'task-images');

drop policy if exists "task-images: anon delete" on storage.objects;
create policy "task-images: anon delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'task-images');

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

-- Confirms both buckets after the inserts above.
select id, public, file_size_limit, allowed_mime_types from storage.buckets
where id in ('task-images', 'event-images');
