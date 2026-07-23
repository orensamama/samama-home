-- Adds:
-- 1. shopping.qty -- quantity for a shopping-list line item, editable via
--    quick +/- controls in the Arsenal and Live Shopping List. Defaults to
--    1 for existing rows and any insert that doesn't specify it.
--
-- Run after 0011 (already applied).

alter table public.shopping add column if not exists qty int not null default 1;

alter table public.shopping add constraint shopping_qty_positive check (qty > 0);
