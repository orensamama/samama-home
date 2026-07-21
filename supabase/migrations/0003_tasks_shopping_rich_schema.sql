-- Upgrade tasks & shopping into rich modules, add master_products (the
-- shopping "arsenal" bank).
--
-- Both `tasks` and `shopping` are dropped and recreated rather than
-- ALTERed: as of this migration, 0002_fix_tasks_shopping_events_expenses.sql
-- still hadn't been run against the live project (tasks/shopping were still
-- the original broken stub tables), so there's no real data to preserve.
-- If you've since added real rows, back them up before running this.
--
-- Run this once in the Supabase SQL Editor. Note: 0002 is still needed
-- separately to fix `events`/`expenses`, which this migration does not touch.

create extension if not exists pgcrypto;

drop table if exists public.tasks cascade;
drop table if exists public.shopping cascade;
drop table if exists public.master_products cascade;

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assignee text not null default 'Shared'
    check (assignee in ('Oren', 'Orit', 'Shared', 'Other')),
  due_date date,
  urgency text not null default 'medium'
    check (urgency in ('low', 'medium', 'high')),
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done')),
  notes text,
  category text,
  is_personal boolean not null default false,
  is_template boolean not null default false,
  -- Groups template rows into one loadable block (e.g. all rows tagged
  -- 'אריזה לחופשה' get instantiated together by "Load Template"). Not in
  -- the original column list but required for is_template to be useful.
  template_name text,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "tasks: anon full access" on public.tasks
  for all to anon, authenticated
  using (true)
  with check (true);

-- A few real starter tasks.
insert into public.tasks (title, assignee, urgency, status, category, is_personal) values
  ('לשלם חשבון חשמל', 'Shared', 'high', 'todo', 'כספים', false),
  ('לקבוע תור לרופא שיניים', 'Orit', 'medium', 'todo', 'בריאות', true),
  ('להחזיר ספרים לספרייה', 'Oren', 'low', 'todo', 'כללי', true);

-- Templates: grouped by template_name, is_template = true.
insert into public.tasks (title, assignee, urgency, status, category, is_template, template_name) values
  ('לארוז בגדים לילדים', 'Shared', 'medium', 'todo', 'חופשה', true, 'אריזה לחופשה'),
  ('לבדוק דרכונים ומסמכים', 'Shared', 'high', 'todo', 'חופשה', true, 'אריזה לחופשה'),
  ('להכין תיק חטיפים לדרך', 'Shared', 'low', 'todo', 'חופשה', true, 'אריזה לחופשה'),
  ('לטעון את כל המכשירים', 'Shared', 'medium', 'todo', 'חופשה', true, 'אריזה לחופשה'),
  ('לבדוק תחזית מזג אוויר', 'Shared', 'low', 'todo', 'חופשה', true, 'אריזה לחופשה'),
  ('לקנות חלה ויין', 'Shared', 'medium', 'todo', 'סופ"ש', true, 'הכנת הבית לסופ"ש'),
  ('לנקות את הסלון', 'Shared', 'medium', 'todo', 'סופ"ש', true, 'הכנת הבית לסופ"ש'),
  ('להחליף מצעים', 'Shared', 'low', 'todo', 'סופ"ש', true, 'הכנת הבית לסופ"ש'),
  ('להכין ארוחת שישי', 'Shared', 'high', 'todo', 'סופ"ש', true, 'הכנת הבית לסופ"ש'),
  ('לרוקן את הפח', 'Shared', 'low', 'todo', 'סופ"ש', true, 'הכנת הבית לסופ"ש');

-- ---------------------------------------------------------------------------
-- master_products: the shopping "arsenal" bank
-- ---------------------------------------------------------------------------
create table public.master_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'אחר',
  default_qty int not null default 1,
  created_at timestamptz not null default now()
);

alter table public.master_products enable row level security;

create policy "master_products: anon full access" on public.master_products
  for all to anon, authenticated
  using (true)
  with check (true);

insert into public.master_products (name, category) values
  ('חלב', 'מוצרי חלב'),
  ('גבינה צהובה', 'מוצרי חלב'),
  ('יוגורט', 'מוצרי חלב'),
  ('חמאה', 'מוצרי חלב'),
  ('עגבניות', 'ירקות ופירות'),
  ('מלפפונים', 'ירקות ופירות'),
  ('בננות', 'ירקות ופירות'),
  ('תפוחים', 'ירקות ופירות'),
  ('עוף', 'בשר ודגים'),
  ('בשר טחון', 'בשר ודגים'),
  ('סלמון', 'בשר ודגים'),
  ('לחם', 'מאפים'),
  ('פיתות', 'מאפים'),
  ('אורז', 'מזווה'),
  ('פסטה', 'מזווה'),
  ('שמן זית', 'מזווה'),
  ('קפה', 'מזווה'),
  ('נוזל כלים', 'ניקיון'),
  ('נייר טואלט', 'ניקיון'),
  ('אבקת כביסה', 'ניקיון'),
  ('שמפו', 'טיפוח והיגיינה'),
  ('משחת שיניים', 'טיפוח והיגיינה');

-- ---------------------------------------------------------------------------
-- shopping
-- ---------------------------------------------------------------------------
create table public.shopping (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.master_products(id) on delete set null,
  title text not null,
  category text,
  completed boolean not null default false,
  in_cart boolean not null default true,
  added_by text not null default 'Shared'
    check (added_by in ('Oren', 'Orit', 'Shared', 'Other')),
  created_at timestamptz not null default now()
);

alter table public.shopping enable row level security;

create policy "shopping: anon full access" on public.shopping
  for all to anon, authenticated
  using (true)
  with check (true);

insert into public.shopping (title, category, added_by) values
  ('חלב', 'מוצרי חלב', 'Shared'),
  ('לחם', 'מאפים', 'Shared'),
  ('ביצים', 'מוצרי חלב', 'Shared');

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.tasks,
  public.shopping,
  public.master_products;
