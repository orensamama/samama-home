-- Fixes Supabase's "rls_disabled_in_public" alert ("Table publicly accessible ... Row-Level Security is not
-- enabled") and keeps it fixed. Idempotent; safe to run any number of times. Paste it into the Supabase
-- SQL editor and run it once.
--
-- Part 1: a sweep. EVERY table in the public schema gets Row Level Security enabled, however it was
--         created (an old migration, by hand, by the dashboard). A table that already has policies keeps
--         them. A table that has none gets the app's standard policy ("anon full access"), because the
--         app talks to Supabase with the anon key and has no sign-in: without a policy, RLS would block
--         the app completely with "permission denied" / empty results.
--
-- Part 2: a safety net. From now on, every table created in the public schema has RLS switched on
--         automatically (an event trigger), so a table made later in the dashboard can't reintroduce the
--         alert. NOTE: such a table has no policy until you add one, so the app can't read it until then.
--
-- IMPORTANT: with no sign-in in the app, the policy still lets anyone holding the project URL + anon key
-- read and write these tables. RLS being ON clears this alert, but real per-user protection needs Supabase
-- Auth (a family login) and policies written "to authenticated" -- changing them now would lock the app out.
--
-- To check afterwards (should return no rows):
--   select tablename from pg_tables where schemaname = 'public' and not rowsecurity;

-- ---------------------------------------------------------------------------
-- Part 1: sweep
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Part 2: RLS on automatically for tables created later
-- ---------------------------------------------------------------------------
do $$
begin
  create or replace function public.rls_auto_enable()
  returns event_trigger
  language plpgsql
  security definer
  set search_path = pg_catalog
  as $fn$
  declare
    cmd record;
  begin
    for cmd in
      select * from pg_event_trigger_ddl_commands()
      where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
        and object_type in ('table', 'partitioned table')
    loop
      if cmd.schema_name = 'public' then
        begin
          execute format('alter table if exists %s enable row level security', cmd.object_identity);
        exception when others then
          raise log 'rls_auto_enable: could not enable RLS on %: %', cmd.object_identity, sqlerrm;
        end;
      end if;
    end loop;
  end;
  $fn$;

  drop event trigger if exists ensure_rls;
  create event trigger ensure_rls
    on ddl_command_end
    when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
    execute function public.rls_auto_enable();
exception when others then
  -- event triggers need elevated rights; if this project doesn't allow it, part 1 still did its job
  raise notice 'auto-enable trigger skipped: %', sqlerrm;
end
$$;
