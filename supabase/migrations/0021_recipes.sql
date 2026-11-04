-- Samama Cookbook ("ספר המתכונים המשפחתי"). Idempotent and additive.
--
-- recipes.categories is a text[] of tag names, so a recipe can belong to many
-- categories at once ("בשרים", "ארוחת שישי", "ללא גלוטן"); recipe_tags holds the
-- family's own list of tags (add / rename / delete from the UI).
-- ingredients is a jsonb array of the ORIGINAL ingredient lines, untouched --
-- quantities are only scaled at display time by the portion scaler.
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  categories text[] not null default '{}',
  servings numeric,
  ingredients jsonb not null default '[]'::jsonb,
  instructions text not null default '',
  tips text not null default '',
  description text not null default '',
  source_url text,
  embed_url text,
  image_url text,
  original_text text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes are best-effort: on a table that pre-dates this migration the columns may
-- not exist yet (migration 0023 adds them); an index must never abort the script.
do $$
begin
  create index if not exists recipes_categories_gin on public.recipes using gin (categories);
  create index if not exists recipes_created_at_idx on public.recipes (created_at desc);
exception when others then
  raise notice 'recipes indexes skipped: %', sqlerrm;
end
$$;

create table if not exists public.recipe_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

do $$
begin
  create unique index if not exists recipe_tags_name_key on public.recipe_tags (name);
exception when others then null;
end
$$;

alter table public.recipes enable row level security;
alter table public.recipe_tags enable row level security;

drop policy if exists "anon full access" on public.recipes;
create policy "anon full access" on public.recipes
  for all to anon, authenticated using (true) with check (true);
drop policy if exists "anon full access" on public.recipe_tags;
create policy "anon full access" on public.recipe_tags
  for all to anon, authenticated using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.recipes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.recipe_tags;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

-- Recipe photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recipe-images: public read" on storage.objects;
create policy "recipe-images: public read" on storage.objects
  for select to public using (bucket_id = 'recipe-images');
drop policy if exists "recipe-images: anon upload" on storage.objects;
create policy "recipe-images: anon upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'recipe-images');
drop policy if exists "recipe-images: anon delete" on storage.objects;
create policy "recipe-images: anon delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'recipe-images');
