-- Fix-up migration: the tasks/shopping/events/expenses tables that already
-- existed in this project (empty, with a different/no schema) caused
-- `create table if not exists` in 0001_init.sql to silently no-op for them
-- -- so they never got the title/done/event_date/amount columns the app
-- expects. `quote` was unaffected since it didn't collide with anything.
--
-- All four are currently empty, so it's safe to drop and recreate them with
-- the correct schema. Run this once in the Supabase SQL Editor.

drop table if exists public.tasks cascade;
drop table if exists public.shopping cascade;
drop table if exists public.events cascade;
drop table if exists public.expenses cascade;

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
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
create table public.shopping (
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
create table public.events (
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
create table public.expenses (
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
-- Realtime: re-add the recreated tables to the publication (a dropped table
-- is automatically removed from any publication it was part of).
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.tasks,
  public.shopping,
  public.events,
  public.expenses;
