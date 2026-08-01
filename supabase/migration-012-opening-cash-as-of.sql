-- ============================================================
-- Migration 012: opening cash as-of month
-- Purely additive.
--
-- opening_cash_as_of: yyyy-mm when opening_cash is the opening balance.
-- History after that month is rolled forward automatically so the
-- first visible plan month gets the correct opening cash.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.company_finance_settings
  add column if not exists opening_cash_as_of text;
