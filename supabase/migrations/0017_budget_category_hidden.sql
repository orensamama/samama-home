-- Lets a budget category be hidden instead of deleted.
--
-- Deleting a category detaches every expense that used it (category_id is
-- set to null), losing the categorisation. Hiding keeps all the history
-- intact: a hidden category drops out of the dashboard, the budget maths
-- and the "new expense" picker, and can be shown again at any time.
--
-- Idempotent and non-destructive.

alter table public.budget_categories
  add column if not exists is_hidden boolean not null default false;
