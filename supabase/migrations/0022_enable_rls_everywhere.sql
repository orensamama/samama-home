-- Fixes Supabase's "rls_disabled_in_public" security alert: makes sure EVERY table
-- in the public schema has Row Level Security enabled, however it was created
-- (by hand, by an old migration, or by the dashboard).
--
-- A table that already has policies keeps them. A table that has none gets the
-- app's standard policy ("anon full access"), because the app talks to Supabase
-- with the anon key and has no sign-in -- without a policy RLS would block it
-- completely. Idempotent; safe to run any number of times.
--
-- NOTE: with no sign-in in the app, that policy still lets anyone holding the
-- anon key read/write these tables. RLS being ON clears the alert, but real
-- per-user protection needs Supabase Auth (see the README / chat notes).
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    begin
      execute format('alter table public.%I enable row level security', t.tablename);
      if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = t.tablename
      ) then
        execute format(
          'create policy "anon full access" on public.%I for all to anon, authenticated using (true) with check (true)',
          t.tablename
        );
      end if;
    exception when others then
      -- e.g. extension-owned tables we aren't allowed to alter: skip, don't fail the whole run
      raise notice 'skipped public.%: %', t.tablename, sqlerrm;
    end;
  end loop;
end
$$;
