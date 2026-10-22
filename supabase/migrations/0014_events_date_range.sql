-- Adds:
-- 1. events.end_date -- optional last day of a multi-day event (e.g. a
--    vacation). NULL means a single-day event (end_date == event_date).
--
-- Run after 0013. Idempotent: safe even if it was already applied by hand
-- (the automated pipeline may run it on a database that already has it).

alter table public.events add column if not exists end_date date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_end_date_after_start' and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_end_date_after_start check (end_date is null or end_date >= event_date);
  end if;
end
$$;
