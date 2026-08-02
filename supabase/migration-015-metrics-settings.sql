-- ============================================================
-- Migration 015: company metrics settings (singleton)
-- Editable from the Metrics page; used for stale thresholds,
-- maturity windows, and expected-conversion assumptions.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Also ensure migration-014-pipeline-metrics.sql has been applied.
-- ============================================================

create table if not exists public.company_metrics_settings (
  id integer primary key default 1 check (id = 1),
  stale_cold_days integer not null default 180
    check (stale_cold_days > 0),
  stale_hot_days integer not null default 120
    check (stale_hot_days > 0),
  stale_under_development_days integer not null default 90
    check (stale_under_development_days > 0),
  maturity_under_development_months integer not null default 12
    check (maturity_under_development_months > 0),
  maturity_commissioned_months integer not null default 30
    check (maturity_commissioned_months > 0),
  healthy_conversion_probability numeric not null default 0.35
    check (
      healthy_conversion_probability >= 0
      and healthy_conversion_probability <= 1
    ),
  stale_recovery_probability numeric not null default 0.1
    check (
      stale_recovery_probability >= 0
      and stale_recovery_probability <= 1
    ),
  updated_at timestamptz not null default now()
);

comment on table public.company_metrics_settings is
  'Singleton company settings for pipeline metrics thresholds and assumptions.';

insert into public.company_metrics_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.company_metrics_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'company_metrics_settings'
      and policyname = 'company_metrics_settings_all'
  ) then
    create policy company_metrics_settings_all
      on public.company_metrics_settings
      for all
      using (true)
      with check (true);
  end if;
end $$;
