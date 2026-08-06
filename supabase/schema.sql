-- ============================================================
-- Hydrogenera Sales Leads Tracker — Supabase schema (full)
-- Run this in the Supabase Dashboard -> SQL Editor for a fresh DB.
-- For existing databases, apply migrations in order through
--   migration-013-excel-finance-local.sql
-- ============================================================

-- ---------- Tables ----------

create table if not exists public.team_members (
  id text primary key,
  name text not null,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text not null,
  country text not null,
  city text not null default '',
  series text not null default 'Z Series'
    check (series in ('Z Series', 'E Series', 'Custom')),
  market text not null default 'Clean H2'
    check (market in (
      'Cement',
      'Power Plants',
      'Funding',
      'Clean H2',
      'Burner Optimisation',
      'Tenders'
    )),
  size_kw integer not null
    check (size_kw > 0),
  stage text not null default 'cold-lead'
    check (stage in (
      'to-contact',
      'cold-lead',
      'hot-lead',
      'under-development',
      'commissioned',
      'cancelled'
    )),
  base_description text not null default '',
  ai_summary text,
  -- Ownership + client follow-up
  lead_user_id text,
  last_client_contact_at date not null default current_date,
  email_reminder_days integer not null default 7
    check (email_reminder_days > 0),
  email_reminder_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  text text not null,
  author text not null default 'You',
  author_user_id text,
  -- Set when the comment also moved the project to a new stage
  stage_change text
    check (stage_change in (
      'to-contact',
      'cold-lead',
      'hot-lead',
      'under-development',
      'commissioned',
      'cancelled'
    )),
  created_at timestamptz not null default now()
);

create table if not exists public.project_todos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null default 'our-action'
    check (kind in ('question', 'our-action', 'client-action')),
  text text not null,
  answer text,
  done boolean not null default false,
  due_date date,
  owner_user_id text,
  created_at timestamptz not null default now(),
  -- Set when the item is checked off, cleared when unchecked
  done_at timestamptz
);

create table if not exists public.project_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text,
  email text,
  phone text,
  position text,
  created_at timestamptz not null default now()
);

-- Finance (payments / expenses / milestones / company settings) is Excel +
-- localStorage only — see migration-013-excel-finance-local.sql.

-- ---------- Indexes ----------

create index if not exists projects_created_at_idx
  on public.projects (created_at desc);

create index if not exists project_comments_project_created_idx
  on public.project_comments (project_id, created_at);

create index if not exists project_todos_project_created_idx
  on public.project_todos (project_id, created_at);

create index if not exists project_contacts_project_created_idx
  on public.project_contacts (project_id, created_at);

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes >= 0),
  kind text not null default 'other'
    check (kind in ('offer', 'financial-model', 'other')),
  note text,
  storage_path text not null,
  uploaded_by_user_id text,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists project_files_project_created_idx
  on public.project_files (project_id, created_at desc);

create index if not exists team_members_name_idx
  on public.team_members (name);

-- ---------- Row Level Security ----------
-- The app has no user accounts yet, so the browser (anon key) gets full
-- access. If you add Supabase Auth later, tighten these policies.

alter table public.team_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_comments enable row level security;
alter table public.project_todos enable row level security;
alter table public.project_contacts enable row level security;
alter table public.project_files enable row level security;

drop policy if exists "anon full access" on public.team_members;
create policy "anon full access"
  on public.team_members
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "anon full access" on public.projects;
create policy "anon full access"
  on public.projects
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "anon full access" on public.project_comments;
create policy "anon full access"
  on public.project_comments
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "anon full access" on public.project_todos;
create policy "anon full access"
  on public.project_todos
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "anon full access" on public.project_contacts;
create policy "anon full access"
  on public.project_contacts
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "anon full access" on public.project_files;
create policy "anon full access"
  on public.project_files
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ---------- Project Gantt schedule ----------
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

alter table public.project_gantt_phases
  add column if not exists wbs text,
  add column if not exists owner text,
  add column if not exists actual_start_date date,
  add column if not exists actual_duration_days integer;

alter table public.project_gantt_deadlines
  add column if not exists wbs text,
  add column if not exists owner text,
  add column if not exists actual_date date;

create table if not exists public.project_gantt_activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  phase_id uuid not null references public.project_gantt_phases (id) on delete cascade,
  name text not null,
  start_date date not null,
  duration_days integer not null check (duration_days >= 1),
  actual_start_date date,
  actual_duration_days integer,
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

-- ---------- App change events (audit / process history) ----------
-- Financial amounts stay out of Postgres. finance_meta rows store keys +
-- who/when/intentional only; amounts live in the financial history CSV.
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

alter table public.app_change_events enable row level security;

drop policy if exists "anon full access" on public.app_change_events;
create policy "anon full access"
  on public.app_change_events
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ---------- Seed data (optional) ----------
-- The same demo projects the app used to ship with. Delete this section
-- if you want to start with an empty tracker.

insert into public.team_members (id, name)
values
  ('u-andrew', 'Andrew'),
  ('u-maria', 'Maria'),
  ('u-daniel', 'Daniel'),
  ('u-irina', 'Irina')
on conflict (id) do nothing;

insert into public.projects
  (id, name, client, country, city, series, market, size_kw, stage, base_description, created_at)
values
  ('11111111-1111-4111-8111-111111111111',
   'Sofia District Heating H2 Blend', 'Toplofikacia Sofia', 'Bulgaria', 'Sofia',
   'Z Series', 'Clean H2', 1000, 'under-development',
   'Green hydrogen production for blending into the district heating gas supply, targeting a 10% H2 blend in the first phase.',
   now() - interval '120 days'),
  ('22222222-2222-4222-8222-222222222222',
   'Warsaw Glassworks Oxy-Fuel Boost', 'Vitro-Pol S.A.', 'Poland', 'Warsaw',
   'E Series', 'Burner Optimisation', 250, 'cold-lead',
   'E Series system to feed hydrogen and oxygen into the glass furnace combustion process to cut natural gas consumption.',
   now() - interval '14 days'),
  ('33333333-3333-4333-8333-333333333333',
   'Munich Bus Fleet Refuelling', 'Stadtwerke München', 'Germany', 'Munich',
   'Z Series', 'Clean H2', 2000, 'hot-lead',
   'Hydrogen production and compression for a municipal bus refuelling station, initial fleet of 12 fuel-cell buses.',
   now() - interval '21 days'),
  ('44444444-4444-4444-8444-444444444444',
   'Istanbul Steel Annealing Line', 'Marmara Çelik', 'Turkey', 'Istanbul',
   'Custom', 'Clean H2', 500, 'commissioned',
   'On-site hydrogen generation replacing trucked-in cylinders for the bright annealing line, with metal hydride buffer storage.',
   now() - interval '300 days'),
  ('55555555-5555-4555-8555-555555555555',
   'Plovdiv Greenhouse CHP', 'AgroTherm EOOD', 'Bulgaria', 'Plovdiv',
   'E Series', 'Burner Optimisation', 100, 'cold-lead',
   'Small E Series unit to enrich the CHP combustion for a tomato greenhouse complex, improving burner efficiency and CO2 dosing.',
   now() - interval '7 days')
on conflict (id) do nothing;

insert into public.project_comments (project_id, text, author, stage_change, created_at)
values
  ('11111111-1111-4111-8111-111111111111',
   'Site survey completed. Grid connection point confirmed at the Iztok substation, water supply adequate.',
   'You', null, now() - interval '60 days'),
  ('11111111-1111-4111-8111-111111111111',
   'Contract signed for phase 1. Moving to engineering design.',
   'You', 'under-development', now() - interval '35 days'),
  ('11111111-1111-4111-8111-111111111111',
   'P&ID review meeting held with client engineers. Minor changes requested to the drying skid layout, revised drawings due next week.',
   'You', null, now() - interval '4 days'),
  ('22222222-2222-4222-8222-222222222222',
   'Intro call via NABLA (Poland integrator). Client wants a feasibility estimate on fuel savings before committing to a site visit.',
   'You', null, now() - interval '12 days'),
  ('33333333-3333-4333-8333-333333333333',
   'Hydro Future GmbH forwarded the tender documents. Deadline for the technical proposal is end of next month.',
   'You', null, now() - interval '18 days'),
  ('33333333-3333-4333-8333-333333333333',
   'Sent preliminary sizing: 2 MW Z Series with 350 bar compression and 400 kg/day output. Awaiting client feedback.',
   'You', null, now() - interval '6 days'),
  ('44444444-4444-4444-8444-444444444444',
   'FAT passed with client representatives present.',
   'You', null, now() - interval '90 days'),
  ('44444444-4444-4444-8444-444444444444',
   'Commissioning completed, system handed over. Purity verified at 99.999% after the dryer.',
   'You', 'commissioned', now() - interval '45 days'),
  ('44444444-4444-4444-8444-444444444444',
   'First monthly service visit done. Client happy, discussing an option for a second unit at their Izmir plant.',
   'You', null, now() - interval '10 days');
