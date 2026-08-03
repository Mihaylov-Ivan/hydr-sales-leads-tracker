-- ============================================================
-- Migration 019: drop unused next-action columns
--
-- next_action_text / next_action_due_at are no longer in the app.
-- Stale detection uses last_meaningful_activity_at only (Cold/Hot).
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.projects
  drop column if exists next_action_text,
  drop column if exists next_action_due_at;
