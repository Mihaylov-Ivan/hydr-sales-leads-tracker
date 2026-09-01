-- ============================================================
-- Migration 035: drop audit / stage history tables
-- Removes app_change_events and project_stage_history.
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

drop table if exists public.app_change_events cascade;
drop table if exists public.project_stage_history cascade;
