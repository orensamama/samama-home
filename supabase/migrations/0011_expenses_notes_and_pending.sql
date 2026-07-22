-- Adds:
-- 1. expenses.notes -- optional free-text detail for an expense.
-- 2. expenses.amount_pending -- true when the expense is planned but the
--    final amount isn't known yet ("בבירור"). `amount` stays not-null and
--    is simply stored as 0 while pending.
--
-- Run after 0010 (already applied).

alter table public.expenses add column if not exists notes text;

alter table public.expenses add column if not exists amount_pending boolean not null default false;
