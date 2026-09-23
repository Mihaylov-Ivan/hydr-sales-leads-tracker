-- ============================================================
-- Migration 053: new users start with reminders off
-- Additive — changes the per-user reminder default to false.
-- Existing rows are left unchanged.
-- ============================================================

alter table public.project_user_reminders
  alter column email_reminder_enabled set default false;
