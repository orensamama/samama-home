-- Family Budget ("כלכלת המשפחה") -- Phase 1.
--
-- Adds the budget structure on top of the existing `expenses` table, so
-- every expense already recorded keeps working (they simply show up as
-- "ללא קטגוריה" until someone assigns a category):
--   * budget_categories  -- the editable income / fixed / variable /
--                           sinking-fund structure, seeded from the family
--                           Excel template (only if the table is empty).
--   * merchant_categories -- remembers which category a store usually
--                           belongs to, for one-tap suggestions.
--   * expenses.category_id / store / receipt_url -- link an expense to a
--     category, a store name and an optional receipt photo.
--   * receipt-images storage bucket.
--
-- Idempotent and non-destructive: safe to run any number of times, never
-- drops or rewrites existing data.

-- ---------------------------------------------------------------------------
-- budget_categories
-- ---------------------------------------------------------------------------
create table if not exists public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('income', 'fixed', 'variable', 'sinking')),
  group_name text not null default 'כללי',
  monthly_budget numeric(12, 2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.budget_categories enable row level security;

drop policy if exists "budget_categories: anon full access" on public.budget_categories;
create policy "budget_categories: anon full access" on public.budget_categories
  for all to anon, authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- merchant_categories: store name -> default category
-- ---------------------------------------------------------------------------
create table if not exists public.merchant_categories (
  id uuid primary key default gen_random_uuid(),
  store_key text not null unique,
  store_name text not null,
  category_id uuid not null references public.budget_categories(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.merchant_categories enable row level security;

drop policy if exists "merchant_categories: anon full access" on public.merchant_categories;
create policy "merchant_categories: anon full access" on public.merchant_categories
  for all to anon, authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- expenses: category, store, receipt
-- ---------------------------------------------------------------------------
alter table public.expenses
  add column if not exists category_id uuid references public.budget_categories(id) on delete set null;
alter table public.expenses add column if not exists store text;
alter table public.expenses add column if not exists receipt_url text;

create index if not exists expenses_category_id_idx on public.expenses (category_id);
create index if not exists expenses_expense_date_idx on public.expenses (expense_date);

-- ---------------------------------------------------------------------------
-- Realtime for the new tables (skip ones already in the publication)
-- ---------------------------------------------------------------------------
do $$
declare
  table_name text;
begin
  foreach table_name in array array['budget_categories', 'merchant_categories'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Receipt photos bucket (same public/anon model as task-images/event-images)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipt-images', 'receipt-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "receipt-images: public read" on storage.objects;
create policy "receipt-images: public read" on storage.objects
  for select to public
  using (bucket_id = 'receipt-images');

drop policy if exists "receipt-images: anon upload" on storage.objects;
create policy "receipt-images: anon upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'receipt-images');

drop policy if exists "receipt-images: anon delete" on storage.objects;
create policy "receipt-images: anon delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'receipt-images');

-- ---------------------------------------------------------------------------
-- Base template from the family Excel (seeded once, only into an empty
-- table; budgets start at 0 so the family fills in its own targets)
-- ---------------------------------------------------------------------------
insert into public.budget_categories (name, kind, group_name, sort_order)
select v.name, v.kind, v.group_name, v.ord * 10
from (values
  -- הכנסות קבועות
  ('משכורת אורן', 'income', 'הכנסות', 1),
  ('משכורת אורית', 'income', 'הכנסות', 2),
  ('קצבת ילדים', 'income', 'הכנסות', 3),
  ('הכנסה מנכסים/עסק', 'income', 'הכנסות', 4),
  ('אחר', 'income', 'הכנסות', 5),
  -- הוצאות קבועות ("שכח מזה")
  ('שכ"ד/משכנתא', 'fixed', 'דיור', 6),
  ('ארנונה', 'fixed', 'דיור', 7),
  ('ועד בית', 'fixed', 'דיור', 8),
  ('ביטוח מבנה', 'fixed', 'דיור', 9),
  ('מעון/משפחתון', 'fixed', 'חינוך וחוגים', 10),
  ('בייביסיטר', 'fixed', 'חינוך וחוגים', 11),
  ('ועד הורים', 'fixed', 'חינוך וחוגים', 12),
  ('ספורט/חוגים', 'fixed', 'חינוך וחוגים', 13),
  ('ביטוח חובה', 'fixed', 'תחבורה קבועה', 14),
  ('ביטוח מקיף', 'fixed', 'תחבורה קבועה', 15),
  ('רישיון רכב/טסט', 'fixed', 'תחבורה קבועה', 16),
  ('תיקוני רכב', 'fixed', 'תחבורה קבועה', 17),
  ('אחריות סוללה', 'fixed', 'תחבורה קבועה', 18),
  ('קופת חולים', 'fixed', 'בריאות וטיפולים', 19),
  ('תרופות קבועות', 'fixed', 'בריאות וטיפולים', 20),
  ('טיפולים', 'fixed', 'בריאות וטיפולים', 21),
  ('אפל', 'fixed', 'תקשורת ומנויים', 22),
  ('גוגל', 'fixed', 'תקשורת ומנויים', 23),
  ('נטפליקס', 'fixed', 'תקשורת ומנויים', 24),
  ('אינטרנט', 'fixed', 'תקשורת ומנויים', 25),
  ('עמלות כרטיס אשראי', 'fixed', 'פיננסי וביטוחים', 26),
  ('תחזוקת עסק', 'fixed', 'פיננסי וביטוחים', 27),
  ('ביטוחי בריאות', 'fixed', 'פיננסי וביטוחים', 28),
  -- הוצאות משתנות (ניהול שוטף)
  ('סופר/מזון', 'variable', 'מזון ובית', 29),
  ('מסעדות ובתי קפה', 'variable', 'מזון ובית', 30),
  ('דלק', 'variable', 'תחבורה משתנה', 31),
  ('תחבורה ציבורית', 'variable', 'תחבורה משתנה', 32),
  ('כביש 6', 'variable', 'תחבורה משתנה', 33),
  ('חניונים', 'variable', 'תחבורה משתנה', 34),
  ('חשמל', 'variable', 'חשבונות בית', 35),
  ('מים', 'variable', 'חשבונות בית', 36),
  ('גז', 'variable', 'חשבונות בית', 37),
  ('העברות כספים (ביט/פייבוקס)', 'variable', 'חשבונות בית', 38),
  ('סופר פארם', 'variable', 'קוסמטיקה, פארם ותינוקות', 39),
  ('מוצרי תינוקות', 'variable', 'קוסמטיקה, פארם ותינוקות', 40),
  ('מספרה', 'variable', 'קוסמטיקה, פארם ותינוקות', 41),
  ('קוסמטיקה', 'variable', 'קוסמטיקה, פארם ותינוקות', 42),
  ('בילויים ומופעים', 'variable', 'תרבות, פנאי ומתנות', 43),
  ('צעצועים', 'variable', 'תרבות, פנאי ומתנות', 44),
  ('מתנות', 'variable', 'תרבות, פנאי ומתנות', 45),
  ('ג''ימבורי', 'variable', 'תרבות, פנאי ומתנות', 46),
  ('קניות בחו"ל/אונליין', 'variable', 'תרבות, פנאי ומתנות', 47),
  -- הוצאות אחת לתקופה (Sinking Funds)
  ('חופשות', 'sinking', 'אחת לתקופה', 48),
  ('פסח', 'sinking', 'אחת לתקופה', 49),
  ('חגים', 'sinking', 'אחת לתקופה', 50),
  ('ציוד לימודים/חופש גדול', 'sinking', 'אחת לתקופה', 51)
) as v(name, kind, group_name, ord)
where not exists (select 1 from public.budget_categories);

-- A few common stores so the "remember the store" suggestions work from
-- day one (also seeded only once; every manual choice teaches new ones).
insert into public.merchant_categories (store_key, store_name, category_id)
select v.store_key, v.store_name, c.id
from (values
  ('רמי לוי', 'רמי לוי', 'סופר/מזון'),
  ('שופרסל', 'שופרסל', 'סופר/מזון'),
  ('יוחננוף', 'יוחננוף', 'סופר/מזון'),
  ('ויקטורי', 'ויקטורי', 'סופר/מזון'),
  ('מגה', 'מגה', 'סופר/מזון'),
  ('טיב טעם', 'טיב טעם', 'סופר/מזון'),
  ('אושר עד', 'אושר עד', 'סופר/מזון'),
  ('סופר פארם', 'סופר פארם', 'סופר פארם'),
  ('ניו פארם', 'ניו פארם', 'סופר פארם'),
  ('פז', 'פז', 'דלק'),
  ('סונול', 'סונול', 'דלק'),
  ('דור אלון', 'דור אלון', 'דלק'),
  ('דלק', 'דלק', 'דלק'),
  ('ארומה', 'ארומה', 'מסעדות ובתי קפה'),
  ('קפה גרג', 'קפה גרג', 'מסעדות ובתי קפה'),
  ('מקדונלדס', 'מקדונלדס', 'מסעדות ובתי קפה'),
  ('נטפליקס', 'נטפליקס', 'נטפליקס'),
  ('netflix', 'Netflix', 'נטפליקס'),
  ('כביש 6', 'כביש 6', 'כביש 6'),
  ('פנגו', 'פנגו', 'חניונים'),
  ('אחוזות החוף', 'אחוזות החוף', 'חניונים')
) as v(store_key, store_name, category_name)
join public.budget_categories c on c.name = v.category_name and c.kind in ('variable', 'fixed')
where not exists (select 1 from public.merchant_categories)
on conflict (store_key) do nothing;
