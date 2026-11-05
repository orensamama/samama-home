-- Recurring vs variable/temporary classification of each transaction ("קבוע" / "משתנה / זמני").
-- NULL means "implied by the category" (variable categories -> variable, everything else ->
-- recurring), so existing rows keep their meaning. Idempotent and additive.
alter table public.expenses add column if not exists flow text;

do $$
begin
  alter table public.expenses
    add constraint expenses_flow_check check (flow is null or flow in ('fixed', 'variable'));
exception
  when duplicate_object then null;
  when others then null;
end
$$;

notify pgrst, 'reload schema';
