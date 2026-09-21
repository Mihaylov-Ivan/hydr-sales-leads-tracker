-- ============================================================
-- Migration 051: Prospecting strategies + Sales Manager permission
-- Additive — expands permission check; adds strategies table.
-- Safe to re-run after a partial/deadlocked attempt.
-- ============================================================

-- ---------- Permission: Sales Manager ----------
-- Keep this short and separate from strategy RLS to reduce lock contention.
alter table public.user_permission_types
  drop constraint if exists user_permission_types_permission_type_check;

alter table public.user_permission_types
  add constraint user_permission_types_permission_type_check
  check (
    permission_type in (
      'sales',
      'finance',
      'warehouse',
      'production',
      'technical_sales',
      'eu_funding_rnd',
      'sales_manager'
    )
  );

-- ---------- Prospecting strategies ----------
create table if not exists public.prospecting_strategies (
  id uuid primary key,
  name text not null,
  markets jsonb not null default '[]'::jsonb,
  industries text not null default '',
  weekly_contact_target integer not null default 0
    check (weekly_contact_target >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists prospecting_strategies_name_uidx
  on public.prospecting_strategies (lower(name));

create index if not exists prospecting_strategies_sort_idx
  on public.prospecting_strategies (sort_order, name);

alter table public.prospecting_strategies enable row level security;

-- Avoid DO-block + pg_policies lookup (prone to deadlocks under concurrent app traffic).
drop policy if exists prospecting_strategies_anon_all on public.prospecting_strategies;
create policy prospecting_strategies_anon_all on public.prospecting_strategies
  for all to anon using (true) with check (true);

-- Seed starter strategies (idempotent by fixed ids)
insert into public.prospecting_strategies (
  id, name, markets, industries, weekly_contact_target, sort_order, is_active, notes
) values
  (
    'a1000000-0000-4000-8000-000000000001',
    'CNG Optimisation',
    '["Burner Optimisation"]'::jsonb,
    'CNG / burner optimisation sites',
    6,
    10,
    true,
    ''
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'Cement Plants',
    '["Cement"]'::jsonb,
    'Cement manufacturing plants',
    5,
    20,
    true,
    ''
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'Power Plants',
    '["Power Plants"]'::jsonb,
    'Power generation facilities',
    4,
    30,
    true,
    ''
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    'H2 Valleys Construction',
    '["Clean H2"]'::jsonb,
    'Hydrogen valleys and industrial H2 construction',
    5,
    40,
    true,
    ''
  )
on conflict (id) do nothing;

-- Align singleton targets with seeded strategy weekly totals (20 / 80)
update public.prospecting_targets
set
  weekly_contact_target = 20,
  monthly_contact_target = 80,
  market_allocation = '{
    "Burner Optimisation": 30,
    "Cement": 25,
    "Power Plants": 20,
    "Clean H2": 25,
    "Tenders": 0
  }'::jsonb,
  updated_at = now()
where id = 1;
