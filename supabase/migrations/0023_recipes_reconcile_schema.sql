-- Aligns an EXISTING public.recipes table (e.g. one created by hand before the
-- cookbook module, which migration 0021's "create table if not exists" skipped)
-- with what the app writes. Purely additive and idempotent: it adds missing
-- columns, never drops or retypes anything. Also lifts NOT NULL on the columns the
-- app may legitimately leave empty, so an import can't be rejected over one.
alter table public.recipes add column if not exists title text default '';
alter table public.recipes add column if not exists categories text[] default '{}';
alter table public.recipes add column if not exists tags text[] default '{}';
alter table public.recipes add column if not exists servings integer;
alter table public.recipes add column if not exists ingredients jsonb default '[]'::jsonb;
alter table public.recipes add column if not exists instructions text default '';
alter table public.recipes add column if not exists tips text default '';
alter table public.recipes add column if not exists notes text default '';
alter table public.recipes add column if not exists description text default '';
alter table public.recipes add column if not exists source_url text;
alter table public.recipes add column if not exists embed_url text;
alter table public.recipes add column if not exists media_url text;
alter table public.recipes add column if not exists source_type text;
alter table public.recipes add column if not exists image_url text;
alter table public.recipes add column if not exists original_text text;
alter table public.recipes add column if not exists is_favorite boolean default false;
alter table public.recipes add column if not exists created_at timestamptz default now();
alter table public.recipes add column if not exists updated_at timestamptz default now();

do $$
declare
  c record;
begin
  for c in
    select a.attname as column_name
    from pg_attribute a
    where a.attrelid = 'public.recipes'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attnotnull
      and not exists (
        select 1 from pg_index i
        where i.indrelid = a.attrelid and i.indisprimary and a.attnum = any (i.indkey)
      )
  loop
    execute format('alter table public.recipes alter column %I drop not null', c.column_name);
  end loop;
end
$$;

alter table public.recipes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipes') then
    create policy "anon full access" on public.recipes
      for all to anon, authenticated using (true) with check (true);
  end if;
end
$$;

-- Make PostgREST notice the new columns right away.
notify pgrst, 'reload schema';
