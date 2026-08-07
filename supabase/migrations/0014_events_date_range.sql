-- Adds:
-- 1. events.end_date -- optional last day of a multi-day event (e.g. a
--    vacation). NULL means a single-day event (end_date == event_date).
--
-- Run after 0013 (already applied).

alter table public.events add column if not exists end_date date;

alter table public.events add constraint events_end_date_after_start check (end_date is null or end_date >= event_date);
