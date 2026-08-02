-- ============================================================
-- Migration 016: per-project Gantt schedule (phases + deadlines)
-- Purely additive — run in the Supabase SQL Editor.
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
