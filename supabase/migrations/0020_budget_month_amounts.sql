-- Per-month budget targets ("פיננסממה"). A category's target for a month is the
-- latest row here for that month or earlier, else its base monthly_budget; so
-- editing a month changes it from then on without rewriting past months.
-- Idempotent and additive.
create table if not exists public.budget_month_amounts (
  category_id uuid not null references public.budget_categories(id) on delete cascade,
  month text not null,
  amount numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (category_id, month)
);

alter table public.budget_month_amounts enable row level security;

drop policy if exists "anon full access" on public.budget_month_amounts;
create policy "anon full access" on public.budget_month_amounts
  for all to anon, authenticated using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.budget_month_amounts;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;
