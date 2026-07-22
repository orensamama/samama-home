-- Adds:
-- 1. events.time -- optional time-of-day for an event (date stays required).
-- 2. tasks.for_member -- who a task is FOR/about, separate from `assignee`
--    (who is RESPONSIBLE for doing it). E.g. assignee='Orit' (she's doing
--    it) but for_member='Ziv' (it's about him, like buying him diapers).
--
-- Run after 0009 (already applied).

alter table public.events add column if not exists time time;

alter table public.tasks add column if not exists for_member text;

alter table public.tasks drop constraint if exists tasks_for_member_check;
alter table public.tasks add constraint tasks_for_member_check
  check (for_member is null or for_member in ('Oren', 'Orit', 'Hadar', 'Ziv'));
