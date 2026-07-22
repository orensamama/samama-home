-- Adds kit_instance_id so loaded kits can be grouped and managed as one
-- unit (collapsible card, bulk clear/delete) instead of flooding the flat
-- task list. Also seeds the missing "שתייה, חטיפים ומתוקים" shopping
-- category. Run after 0008 (already applied).

alter table public.tasks add column if not exists kit_instance_id uuid;

insert into public.master_products (name, category) values
  ('מים מינרליים', 'שתייה, חטיפים ומתוקים'),
  ('מיץ', 'שתייה, חטיפים ומתוקים'),
  ('קולה / משקה מוגז', 'שתייה, חטיפים ומתוקים'),
  ('חטיפי מלוח', 'שתייה, חטיפים ומתוקים'),
  ('ביסקוויטים', 'שתייה, חטיפים ומתוקים'),
  ('שוקולד', 'שתייה, חטיפים ומתוקים'),
  ('וופלים', 'שתייה, חטיפים ומתוקים'),
  ('בורקס / מאפה קפוא', 'שתייה, חטיפים ומתוקים');
