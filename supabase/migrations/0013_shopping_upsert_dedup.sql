-- Fixes duplicate shopping-list rows for the same product (e.g. five
-- separate "שמנת חמוצה" x1 lines instead of one x5 line), which could be
-- created by quick-add, the Arsenal, or the WhatsApp import all doing a
-- plain INSERT with no check for an existing active row.
--
-- 1. One-time cleanup: merge any duplicate ACTIVE rows (in_cart and not
--    completed) that already exist, summing their qty into the oldest
--    row and dropping the rest. Split into two passes: rows linked to an
--    Arsenal product (by product_id) and one-off rows (by title, since
--    product_id is null there).
-- 2. Two partial unique indexes make a duplicate active row impossible
--    to create going forward (NULLs are never equal to each other in a
--    unique index, so linked/unlinked rows never collide with one
--    another here).
-- 3. An upsert_shopping_item() RPC does the check-and-merge atomically
--    in a single statement -- immune to the double-click/double-import
--    race a client-side "check then insert" can't fully close on its
--    own. All add-to-list call sites should go through this RPC instead
--    of a raw insert.
--
-- Run after 0012 (already applied).

-- --- 1. Consolidate existing duplicates -------------------------------

with ranked as (
  select
    id,
    product_id,
    row_number() over (partition by product_id order by created_at asc) as rn,
    sum(qty) over (partition by product_id) as total_qty
  from public.shopping
  where in_cart and not completed and product_id is not null
)
update public.shopping s
set qty = ranked.total_qty
from ranked
where s.id = ranked.id and ranked.rn = 1;

delete from public.shopping s
using (
  select
    id,
    row_number() over (partition by product_id order by created_at asc) as rn
  from public.shopping
  where in_cart and not completed and product_id is not null
) ranked
where s.id = ranked.id and ranked.rn > 1;

with ranked_title as (
  select
    id,
    lower(title) as title_key,
    row_number() over (partition by lower(title) order by created_at asc) as rn,
    sum(qty) over (partition by lower(title)) as total_qty
  from public.shopping
  where in_cart and not completed and product_id is null
)
update public.shopping s
set qty = ranked_title.total_qty
from ranked_title
where s.id = ranked_title.id and ranked_title.rn = 1;

delete from public.shopping s
using (
  select
    id,
    row_number() over (partition by lower(title) order by created_at asc) as rn
  from public.shopping
  where in_cart and not completed and product_id is null
) ranked_title
where s.id = ranked_title.id and ranked_title.rn > 1;

-- --- 2. Prevent future duplicates at the database level ---------------

create unique index if not exists shopping_active_product_uidx
  on public.shopping (product_id)
  where (in_cart and not completed);

create unique index if not exists shopping_active_title_uidx
  on public.shopping (lower(title))
  where (in_cart and not completed and product_id is null);

-- --- 3. Atomic upsert RPC ----------------------------------------------

create or replace function public.upsert_shopping_item(
  p_product_id uuid,
  p_title text,
  p_category text,
  p_qty int,
  p_added_by text
)
returns public.shopping
language plpgsql
set search_path = public, pg_temp
as $$
declare
  result public.shopping;
begin
  if p_product_id is not null then
    insert into public.shopping (product_id, title, category, qty, added_by, in_cart, completed)
    values (p_product_id, p_title, p_category, p_qty, p_added_by, true, false)
    on conflict (product_id) where (in_cart and not completed)
    do update set qty = shopping.qty + excluded.qty
    returning * into result;
  else
    insert into public.shopping (product_id, title, category, qty, added_by, in_cart, completed)
    values (null, p_title, p_category, p_qty, p_added_by, true, false)
    on conflict (lower(title)) where (in_cart and not completed and product_id is null)
    do update set qty = shopping.qty + excluded.qty
    returning * into result;
  end if;
  return result;
end;
$$;

grant execute on function public.upsert_shopping_item(uuid, text, text, int, text) to anon, authenticated;
