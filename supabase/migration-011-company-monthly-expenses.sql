-- ============================================================
-- Migration 011: company monthly operating expenses
-- Purely additive — does NOT delete rows.
--
-- monthly_expenses jsonb on company_finance_settings:
--   [{ "month": "2026-01", "amount": 50000, "status": "actual"|"projected" }, ...]
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.company_finance_settings
  add column if not exists monthly_expenses jsonb not null default '[]'::jsonb;
