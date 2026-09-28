-- ============================================================
-- Migration 060: CRM briefings + Briefings permission
-- Additive. Stores ChatGPT-generated daily/weekly/monthly
-- CRM-only briefing snapshots and exposes them through the app API.
-- ============================================================

-- ---------- Permission: Briefings ----------
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
      'sales_manager',
      'ai_updates',
      'briefings',
      'viewer'
    )
  );

-- ---------- Generated CRM briefings ----------
create table if not exists public.crm_briefings (
  id uuid primary key default gen_random_uuid(),
  briefing_type text not null
    check (briefing_type in ('daily', 'weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  title text not null,
  summary text not null,
  highlights jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  generated_by text not null default 'chatgpt-scheduled-task',
  source_from timestamptz,
  source_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_briefings_period_check check (period_end >= period_start),
  constraint crm_briefings_highlights_array_check
    check (jsonb_typeof(highlights) = 'array'),
  constraint crm_briefings_metrics_object_check
    check (jsonb_typeof(metrics) = 'object'),
  constraint crm_briefings_type_period_uidx
    unique (briefing_type, period_start)
);

create index if not exists crm_briefings_type_period_idx
  on public.crm_briefings (briefing_type, period_start desc);

create index if not exists crm_briefings_generated_at_idx
  on public.crm_briefings (generated_at desc);

alter table public.crm_briefings enable row level security;

-- Briefings are intentionally read through the app's authenticated
-- server API. Do not expose them directly through the public client.
revoke all on table public.crm_briefings from anon, authenticated;
grant select, insert, update, delete on table public.crm_briefings to service_role;
