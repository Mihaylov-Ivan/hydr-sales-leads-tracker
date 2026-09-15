-- ============================================================
-- Migration 042: restore app change events (audit / process history)
-- Purely additive — does NOT delete rows or alter existing tables.
--
-- Records non-financial DB-backed changes (CRM, gantt, warehouse,
-- prospecting, system). Financial amount history stays in Excel/CSV
-- and is intentionally out of scope for now.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

create table if not exists public.app_change_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id text,
  actor_name text,
  intentional boolean not null default true,
  domain text not null
    check (domain in (
      'crm',
      'gantt',
      'warehouse',
      'prospecting',
      'system',
      -- Reserved for a later finance/Excel history pass; app does not write these yet.
      'finance_meta'
    )),
  entity_type text not null,
  entity_id text,
  project_id uuid references public.projects (id) on delete set null,
  action text not null,
  field text,
  summary text not null default '',
  -- Non-monetary context only (ids, stage names, labels). Never store EUR amounts.
  payload_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_change_events_occurred_at_idx
  on public.app_change_events (occurred_at desc);

create index if not exists app_change_events_project_occurred_idx
  on public.app_change_events (project_id, occurred_at desc);

create index if not exists app_change_events_domain_occurred_idx
  on public.app_change_events (domain, occurred_at desc);

create index if not exists app_change_events_actor_occurred_idx
  on public.app_change_events (actor_user_id, occurred_at desc);

create index if not exists app_change_events_entity_occurred_idx
  on public.app_change_events (entity_type, entity_id, occurred_at desc);

comment on table public.app_change_events is
  'Append-only change / process history for DB-backed non-financial data.';

comment on column public.app_change_events.intentional is
  'True for real process changes. Reserved for a future typo-correction mode.';

comment on column public.app_change_events.payload_json is
  'Non-monetary context only (ids, labels, before/after text). No EUR amounts.';

alter table public.app_change_events enable row level security;

drop policy if exists "anon full access" on public.app_change_events;
create policy "anon full access"
  on public.app_change_events
  for all
  to anon, authenticated
  using (true)
  with check (true);
