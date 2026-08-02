-- ============================================================
-- Migration 018: actual dates on Gantt phases / activities / deadlines
-- Purely additive — run after migration-017.
-- ============================================================

alter table public.project_gantt_phases
  add column if not exists actual_start_date date,
  add column if not exists actual_duration_days integer
    check (actual_duration_days is null or actual_duration_days >= 1);

alter table public.project_gantt_activities
  add column if not exists actual_start_date date,
  add column if not exists actual_duration_days integer
    check (actual_duration_days is null or actual_duration_days >= 1);

alter table public.project_gantt_deadlines
  add column if not exists actual_date date;
