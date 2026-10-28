-- Favorite ("common") stores: starred in the store-mapping panel, shown as
-- one-tap chips in the expense form. Idempotent and additive.
alter table public.merchant_categories
  add column if not exists is_favorite boolean not null default false;
