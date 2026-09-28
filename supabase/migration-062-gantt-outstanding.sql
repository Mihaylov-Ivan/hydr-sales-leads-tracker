-- ============================================================
-- Migration 062: per-user Gantt outstanding prefs
-- Used by Outstanding sidebar for technical_sales users:
--  - snooze "missing Gantt" reminders (reappear after 1 month)
--  - approve "project started per Gantt" reminders
-- ============================================================

create table if not exists public.project_gantt_outstanding (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id text not null references public.team_members (id) on delete cascade,
  missing_snoozed_until date,
  start_approved_schedule_start date,
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_gantt_outstanding_user_idx
  on public.project_gantt_outstanding (user_id);

create index if not exists project_gantt_outstanding_project_idx
  on public.project_gantt_outstanding (project_id);

alter table public.project_gantt_outstanding enable row level security;

drop policy if exists "anon full access" on public.project_gantt_outstanding;
create policy "anon full access"
  on public.project_gantt_outstanding
  for all
  to anon, authenticated
  using (true)
  with check (true);

comment on table public.project_gantt_outstanding is
  'Per-user Outstanding prefs for Gantt missing/started notifications.';
