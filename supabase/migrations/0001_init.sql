-- Samama Home: initial schema for quote, tasks, shopping, events, expenses.
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).
--
-- Security note: this app has no authentication layer yet -- it's a shared
-- family device app. RLS is enabled with permissive "anyone with the anon
-- key can read/write" policies, which matches the current no-login design.
-- Tighten these policies later if you add per-user auth.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- quote: a single editable row holding the family's shared quote.
-- ---------------------------------------------------------------------------
create table if not exists public.quote (
  id smallint primary key default 1,
  text text not null default 'לך יש אותי, לי יש אותך, לנו יש אותנו',
  updated_at timestamptz not null default now(),
  constraint quote_singleton check (id = 1)
);

alter table public.quote enable row level security;

create policy "quote: anon full access" on public.quote
  for all to anon, authenticated
  using (true)
  with check (true);

insert into public.quote (id, text)
values (1, 'לך יש אותי, לי יש אותך, לנו יש אותנו')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "tasks: anon full access" on public.tasks
  for all to anon, authenticated
  using (true)
  with check (true);

insert into public.tasks (title, done) values
  ('להביא את הילדים מהגן', false),
  ('לשלם חשבון חשמל', false),
  ('לקבוע תור לרופא שיניים', true);

-- ---------------------------------------------------------------------------
-- shopping
-- ---------------------------------------------------------------------------
create table if not exists public.shopping (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.shopping enable row level security;

create policy "shopping: anon full access" on public.shopping
  for all to anon, authenticated
  using (true)
  with check (true);

insert into public.shopping (title, done) values
  ('חלב', false),
  ('לחם', false),
  ('ביצים', false),
  ('פירות', true);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "events: anon full access" on public.events
  for all to anon, authenticated
  using (true)
  with check (true);

insert into public.events (title, event_date) values
  ('ארוחת שישי במשפחה', '2026-07-24'),
  ('תור לרופא ילדים', '2026-07-29'),
  ('יום הולדת לאורית', '2026-08-02');

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric(10, 2) not null,
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

create policy "expenses: anon full access" on public.expenses
  for all to anon, authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Realtime: broadcast changes on all five tables to subscribed clients.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.quote,
  public.tasks,
  public.shopping,
  public.events,
  public.expenses;
