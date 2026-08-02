-- ============================================================
-- Consolidated migration: 014 → 018
-- Pipeline metrics + company metrics settings + project Gantt
--
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Assumes your base schema already has: projects, project_comments,
-- project_todos, project_contacts, project_files, team_members
-- (through migration ~009 / email reminders).
--
-- Covers:
--   014  pipeline metrics columns + project_stage_history
--   015  company_metrics_settings
--   016  project_gantt_phases + project_gantt_deadlines
--   017  project_gantt_activities + wbs/owner
--   018  actual dates on Gantt rows
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ============================================================
-- 014 — Pipeline metrics fields + stage history
-- ============================================================

alter table public.projects
  add column if not exists cold_lead_entered_at timestamptz,
  add column if not exists hot_lead_entered_at timestamptz,
  add column if not exists under_development_at timestamptz,
  add column if not exists commissioned_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists last_meaningful_activity_at timestamptz,
  add column if not exists next_action_text text,
  add column if not exists next_action_due_at date,
  add column if not exists stale_status boolean not null default false,
  add column if not exists stale_since timestamptz,
  add column if not exists stale_reason text,
  add column if not exists cancellation_reason text;

comment on column public.projects.cold_lead_entered_at is
  'When the project first entered Cold Lead (usually created_at).';
comment on column public.projects.hot_lead_entered_at is
  'When the project first entered Hot Lead.';
comment on column public.projects.under_development_at is
  'When the project first entered Under Development.';
comment on column public.projects.commissioned_at is
  'When the project first reached Commissioned.';
comment on column public.projects.cancelled_at is
  'When the project was cancelled.';
comment on column public.projects.last_meaningful_activity_at is
  'Last substantive client activity (not auto-reminders or internal-only edits).';
comment on column public.projects.next_action_text is
  'Agreed next commercial / technical action.';
comment on column public.projects.next_action_due_at is
  'Due date for the next action; required for healthy (non-stale) open projects.';
comment on column public.projects.stale_status is
  'True when the project is open and past the stage stale threshold without a valid next action.';
comment on column public.projects.cancellation_reason is
  'Why the project was formally cancelled (distinct from stale).';

create table if not exists public.project_stage_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage text not null,
  entered_at timestamptz not null,
  exited_at timestamptz,
  created_at timestamptz not null default now(),
  constraint project_stage_history_stage_check check (
    stage in (
      'cold-lead',
      'hot-lead',
      'under-development',
      'commissioned',
      'cancelled'
    )
  ),
  constraint project_stage_history_exit_after_enter check (
    exited_at is null or exited_at >= entered_at
  )
);

create index if not exists project_stage_history_project_id_idx
  on public.project_stage_history (project_id);

create index if not exists project_stage_history_entered_at_idx
  on public.project_stage_history (entered_at);

comment on table public.project_stage_history is
  'Append-only stage transitions. Conversion metrics must use history, not only current stage.';

-- Backfill denormalized timestamps
update public.projects
set cold_lead_entered_at = coalesce(cold_lead_entered_at, created_at)
where cold_lead_entered_at is null;

update public.projects
set last_meaningful_activity_at = coalesce(
  last_meaningful_activity_at,
  last_client_contact_at::timestamptz,
  created_at
)
where last_meaningful_activity_at is null;

update public.projects
set hot_lead_entered_at = coalesce(hot_lead_entered_at, created_at)
where stage in ('hot-lead', 'under-development', 'commissioned')
  and hot_lead_entered_at is null;

update public.projects
set under_development_at = coalesce(under_development_at, created_at)
where stage in ('under-development', 'commissioned')
  and under_development_at is null;

update public.projects
set commissioned_at = coalesce(commissioned_at, created_at)
where stage = 'commissioned'
  and commissioned_at is null;

update public.projects
set cancelled_at = coalesce(cancelled_at, created_at)
where stage = 'cancelled'
  and cancelled_at is null;

-- Seed one history row for the current stage when empty
insert into public.project_stage_history (project_id, stage, entered_at)
select
  p.id,
  p.stage,
  coalesce(
    case p.stage
      when 'cold-lead' then p.cold_lead_entered_at
      when 'hot-lead' then p.hot_lead_entered_at
      when 'under-development' then p.under_development_at
      when 'commissioned' then p.commissioned_at
      when 'cancelled' then p.cancelled_at
    end,
    p.created_at
  )
from public.projects p
where not exists (
  select 1
  from public.project_stage_history h
  where h.project_id = p.id
);

alter table public.project_stage_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_stage_history'
      and policyname = 'project_stage_history_all'
  ) then
    create policy project_stage_history_all
      on public.project_stage_history
      for all
      using (true)
      with check (true);
  end if;
end $$;

-- ============================================================
-- 015 — Company metrics settings (singleton)
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

-- ============================================================
-- 016 — Project Gantt phases + deadlines
-- ============================================================

create table if not exists public.project_gantt_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  start_date date not null,
  duration_days integer not null check (duration_days >= 1),
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists project_gantt_phases_project_sort_idx
  on public.project_gantt_phases (project_id, sort_order, start_date);

alter table public.project_gantt_phases enable row level security;

drop policy if exists "anon full access" on public.project_gantt_phases;
create policy "anon full access"
  on public.project_gantt_phases
  for all
  to anon, authenticated
  using (true)
  with check (true);

create table if not exists public.project_gantt_deadlines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  phase_id uuid not null references public.project_gantt_phases (id) on delete cascade,
  name text not null,
  date date not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists project_gantt_deadlines_project_date_idx
  on public.project_gantt_deadlines (project_id, date);

create index if not exists project_gantt_deadlines_phase_idx
  on public.project_gantt_deadlines (phase_id);

alter table public.project_gantt_deadlines enable row level security;

drop policy if exists "anon full access" on public.project_gantt_deadlines;
create policy "anon full access"
  on public.project_gantt_deadlines
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ============================================================
-- 017 — Gantt activities + WBS / owner
-- ============================================================

alter table public.project_gantt_phases
  add column if not exists wbs text,
  add column if not exists owner text;

alter table public.project_gantt_deadlines
  add column if not exists wbs text,
  add column if not exists owner text;

create table if not exists public.project_gantt_activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  phase_id uuid not null references public.project_gantt_phases (id) on delete cascade,
  name text not null,
  start_date date not null,
  duration_days integer not null check (duration_days >= 1),
  wbs text,
  owner text,
  color text,
  status text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists project_gantt_activities_phase_sort_idx
  on public.project_gantt_activities (phase_id, sort_order, start_date);

create index if not exists project_gantt_activities_project_idx
  on public.project_gantt_activities (project_id);

alter table public.project_gantt_activities enable row level security;

drop policy if exists "anon full access" on public.project_gantt_activities;
create policy "anon full access"
  on public.project_gantt_activities
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ============================================================
-- 018 — Actual dates on Gantt rows
-- ============================================================

alter table public.project_gantt_phases
  add column if not exists actual_start_date date,
  add column if not exists actual_duration_days integer;

-- Add check only if missing (Postgres has no IF NOT EXISTS for constraints)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_gantt_phases_actual_duration_days_check'
  ) then
    alter table public.project_gantt_phases
      add constraint project_gantt_phases_actual_duration_days_check
      check (actual_duration_days is null or actual_duration_days >= 1);
  end if;
end $$;

alter table public.project_gantt_activities
  add column if not exists actual_start_date date,
  add column if not exists actual_duration_days integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_gantt_activities_actual_duration_days_check'
  ) then
    alter table public.project_gantt_activities
      add constraint project_gantt_activities_actual_duration_days_check
      check (actual_duration_days is null or actual_duration_days >= 1);
  end if;
end $$;

alter table public.project_gantt_deadlines
  add column if not exists actual_date date;

-- ============================================================
-- Done
-- ============================================================
-- Project income/expense schedules remain in local app storage
-- (and Excel import); they are not persisted to Supabase tables yet.
