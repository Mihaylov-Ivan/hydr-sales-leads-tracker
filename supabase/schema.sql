-- ============================================================
-- Hydrogenera Sales Leads Tracker — Supabase schema (full)
-- Run this in the Supabase Dashboard -> SQL Editor for a fresh DB.
-- For existing databases matching the pre-ownership schema, run:
--   migration-005-ownership-reminders-stages.sql
-- ============================================================

-- ---------- Tables ----------

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
      'cold-lead',
      'hot-lead',
      'under-development',
      'commissioned'
    )),
  base_description text not null default '',
  ai_summary text,
  -- Financial scalars (optional)
  contract_value numeric,
  contract_signed_date date,
  expenses numeric,
  expected_profit numeric,
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
      'cold-lead',
      'hot-lead',
      'under-development',
      'commissioned'
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

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null
    check (kind in (
      'contract-signed',
      'engineering-done',
      'manufacturing-done',
      'fat',
      'sat',
      'commissioned'
    )),
  date date not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  amount numeric not null,
  percent numeric,
  due_date date not null,
  label text,
  milestone_id uuid references public.project_milestones (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  amount numeric not null,
  percent numeric,
  due_date date not null,
  label text,
  milestone_id uuid references public.project_milestones (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Indexes ----------

create index if not exists projects_created_at_idx
  on public.projects (created_at desc);

create index if not exists project_comments_project_created_idx
  on public.project_comments (project_id, created_at);

create index if not exists project_todos_project_created_idx
  on public.project_todos (project_id, created_at);

create index if not exists project_contacts_project_created_idx
  on public.project_contacts (project_id, created_at);

create index if not exists project_milestones_project_date_idx
  on public.project_milestones (project_id, date);

create index if not exists project_payments_project_due_idx
  on public.project_payments (project_id, due_date);

create index if not exists project_payments_milestone_idx
  on public.project_payments (milestone_id);

create index if not exists project_expenses_project_due_idx
  on public.project_expenses (project_id, due_date);

create index if not exists project_expenses_milestone_idx
  on public.project_expenses (milestone_id);

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

-- ---------- Row Level Security ----------
-- The app has no user accounts yet, so the browser (anon key) gets full
-- access. If you add Supabase Auth later, tighten these policies.

alter table public.projects enable row level security;
alter table public.project_comments enable row level security;
alter table public.project_todos enable row level security;
alter table public.project_contacts enable row level security;
alter table public.project_milestones enable row level security;
alter table public.project_payments enable row level security;
alter table public.project_expenses enable row level security;
alter table public.project_files enable row level security;

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

drop policy if exists "anon full access" on public.project_milestones;
create policy "anon full access"
  on public.project_milestones
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "anon full access" on public.project_payments;
create policy "anon full access"
  on public.project_payments
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "anon full access" on public.project_expenses;
create policy "anon full access"
  on public.project_expenses
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

-- ---------- Seed data (optional) ----------
-- The same demo projects the app used to ship with. Delete this section
-- if you want to start with an empty tracker.

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
