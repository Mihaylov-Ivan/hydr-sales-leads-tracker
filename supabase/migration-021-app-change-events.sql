-- ============================================================
-- Migration 021: app change events (audit / process history)
-- Purely additive — does NOT delete rows or alter existing tables.
--
-- Financial amounts stay out of Postgres (Excel/CSV/localStorage).
-- Rows with domain = 'finance_meta' store keys + who/when/intentional
-- only; before/after amounts live in the financial history CSV.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

create table if not exists public.app_change_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id text,
  actor_name text,
  intentional boolean not null default false,
  domain text not null
    check (domain in (
      'crm',
      'gantt',
      'finance_meta',
      'warehouse',
      'system'
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

create index if not exists app_change_events_intentional_occurred_idx
  on public.app_change_events (intentional, occurred_at desc);

comment on table public.app_change_events is
  'Append-only change / process history. finance_meta rows must not contain monetary amounts.';

comment on column public.app_change_events.intentional is
  'True when Meaningful change mode was on (real process change vs typo correction).';

comment on column public.app_change_events.payload_json is
  'Non-monetary context only. Link finance snapshots via id = event_id in CSV history.';

alter table public.app_change_events enable row level security;

drop policy if exists "anon full access" on public.app_change_events;
create policy "anon full access"
  on public.app_change_events
  for all
  to anon, authenticated
  using (true)
  with check (true);
