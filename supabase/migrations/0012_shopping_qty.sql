-- Adds:
-- 1. shopping.qty -- quantity for a shopping-list line item, editable via
--    quick +/- controls in the Arsenal and Live Shopping List. Defaults to
--    1 for existing rows and any insert that doesn't specify it.
--
-- Run after 0011. Idempotent: safe even if it was already applied by hand
-- (the automated pipeline may run it on a database that already has it).

alter table public.shopping add column if not exists qty int not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shopping_qty_positive' and conrelid = 'public.shopping'::regclass
  ) then
    alter table public.shopping add constraint shopping_qty_positive check (qty > 0);
  end if;
end
$$;
