-- ============================================================
-- Migration 014: pipeline metrics fields + stage history
-- Purely additive — does NOT delete rows or change existing stages.
--
-- Supports conversion / stale / capacity metrics that require:
-- - denormalized stage entered-at timestamps
-- - historical stage transitions
-- - meaningful activity + next action
-- - stale / cancellation metadata
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ----------------------------------------------------------
-- 1) Columns on projects
-- ----------------------------------------------------------

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

-- ----------------------------------------------------------
-- 2) Stage history table
-- ----------------------------------------------------------

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

-- ----------------------------------------------------------
-- 3) Backfill denormalized timestamps from created_at / stage
-- ----------------------------------------------------------

-- Every project starts as a cold lead at creation unless already set.
update public.projects
set cold_lead_entered_at = coalesce(cold_lead_entered_at, created_at)
where cold_lead_entered_at is null;

-- Seed last meaningful activity from last_client_contact_at or created_at.
update public.projects
set last_meaningful_activity_at = coalesce(
  last_meaningful_activity_at,
  last_client_contact_at::timestamptz,
  created_at
)
where last_meaningful_activity_at is null;

-- Best-effort: if currently in a later stage, set entered-at to created_at
-- when unknown (imperfect; replace with real history as moves are recorded).
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

-- ----------------------------------------------------------
-- 4) Seed one history row for the current stage when empty
-- ----------------------------------------------------------

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

-- ----------------------------------------------------------
-- 5) RLS (match typical projects table posture if RLS is on)
-- ----------------------------------------------------------

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
