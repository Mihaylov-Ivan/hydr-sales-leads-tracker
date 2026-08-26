-- ============================================================
-- Migration 032: personal todo description
-- Additive — safe if migration-031 already ran.
-- ============================================================

alter table public.personal_todos
  add column if not exists description text;

comment on column public.personal_todos.description is
  'Optional longer notes for the personal task';
