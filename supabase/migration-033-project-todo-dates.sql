-- ============================================================
-- Migration 033: project todo work window (start / end dates)
-- Additive — run in the Supabase SQL Editor.
-- ============================================================

alter table public.project_todos
  add column if not exists start_date date;

alter table public.project_todos
  add column if not exists end_date date;

comment on column public.project_todos.start_date is
  'Inclusive start of the work window (when to begin working on the task)';

comment on column public.project_todos.end_date is
  'Inclusive end of the work window (when to aim to finish)';
