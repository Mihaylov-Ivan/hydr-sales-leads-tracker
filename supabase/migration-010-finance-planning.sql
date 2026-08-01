-- ============================================================
-- Migration 010: finance planning foundation
-- Purely additive — does NOT delete rows.
--
-- - actual_date on payments / expenses (actualization)
-- - company_finance_settings singleton (opening cash, WC, probs)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.project_payments
  add column if not exists actual_date date;

alter table public.project_expenses
  add column if not exists actual_date date;

create table if not exists public.company_finance_settings (
  id integer primary key default 1 check (id = 1),
  opening_cash numeric not null default 0,
  min_working_capital numeric not null default 0,
  stage_probabilities jsonb not null default '{
    "cold-lead": 10,
    "hot-lead": 40,
    "under-development": 100,
    "commissioned": 100
  }'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.company_finance_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.company_finance_settings enable row level security;

drop policy if exists "anon full access" on public.company_finance_settings;
create policy "anon full access"
  on public.company_finance_settings
  for all
  to anon, authenticated
  using (true)
  with check (true);
