-- ============================================================
-- Migration 017: Gantt activities + owner/WBS on schedule rows
-- Purely additive — run after migration-016.
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
