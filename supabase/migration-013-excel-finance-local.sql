-- ============================================================
-- Migration 013: finance moved to Excel + localStorage
--
-- Project cash schedules and company finance settings are no longer
-- stored in Postgres. Actuals come from finance2.xlsx; expected
-- schedules and contract summaries live in the browser.
--
-- Drops:
--   project_payments, project_expenses, project_milestones,
--   company_finance_settings
-- Removes from projects:
--   contract_value, contract_signed_date, expenses, expected_profit
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- Child finance tables first (FK order)
drop table if exists public.project_payments cascade;
drop table if exists public.project_expenses cascade;
drop table if exists public.project_milestones cascade;
drop table if exists public.company_finance_settings cascade;

-- Scalar finance columns on projects
alter table public.projects
  drop column if exists contract_value,
  drop column if exists contract_signed_date,
  drop column if exists expenses,
  drop column if exists expected_profit;
