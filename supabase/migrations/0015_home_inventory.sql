-- Home inventory ("מלאי ביתי" / "מה יש בבית").
--
-- The inventory is built on the existing shopping Arsenal (master_products):
-- every product gets an in_stock flag. TRUE = "יש בבית", FALSE = "נגמר".
-- Existing products default to in stock, so nothing changes until someone
-- marks an item as out. The two-way automation lives in the app:
--   * marking a product "נגמר" adds it to the live shopping list, and
--   * checking it off ("נקנה") on the live list flips it back to "יש בבית".
--
-- Idempotent and non-destructive: safe to run any number of times.

alter table public.master_products
  add column if not exists in_stock boolean not null default true;
