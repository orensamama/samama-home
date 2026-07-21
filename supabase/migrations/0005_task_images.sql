-- Adds optional image attachments to tasks. Run this in the Supabase SQL
-- Editor AFTER 0004_complete_schema_fix.sql (0004 creates the `tasks`
-- table itself -- if you haven't run that one yet, run it first or this
-- will fail with "relation public.tasks does not exist").

alter table public.tasks add column if not exists image_url text;

-- Public bucket for task photos: 5MB limit, images only. Public read
-- matches the app's no-auth design (same as everything else so far).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-images',
  'task-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
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
