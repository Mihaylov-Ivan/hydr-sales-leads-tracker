-- ============================================================
-- migration-029: expand project system categories
-- Additive: drop enum check so combinations like "Z Series + MH"
-- and new tags "w/ Stargate" / "MH" can be stored as text.
-- Existing single-value rows stay valid.
-- ============================================================

alter table public.projects
  drop constraint if exists projects_series_check;

-- Optional soft check via comment only — free-form "Tag + Tag" allowed.
comment on column public.projects.series is
  'System categories joined with " + " (Z Series, E Series, Custom, w/ Stargate, MH)';
