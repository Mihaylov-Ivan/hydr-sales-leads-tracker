-- ============================================================
-- Hydrogenera Sales Leads Tracker — Supabase schema
-- Run this in the Supabase Dashboard -> SQL Editor -> New query.
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
  size_kw integer not null
    check (size_kw > 0),
  stage text not null default 'new-lead'
    check (stage in ('new-lead', 'under-development', 'commissioned')),
  base_description text not null default '',
  ai_summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  text text not null,
  author text not null default 'You',
  -- Set when the comment also moved the project to a new stage
  stage_change text
    check (stage_change in ('new-lead', 'under-development', 'commissioned')),
  created_at timestamptz not null default now()
);

create table if not exists public.project_todos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  -- Set when the item is checked off, cleared when unchecked
  done_at timestamptz
);

-- ---------- Indexes ----------

create index if not exists projects_created_at_idx
  on public.projects (created_at desc);

create index if not exists project_comments_project_created_idx
  on public.project_comments (project_id, created_at);

create index if not exists project_todos_project_created_idx
  on public.project_todos (project_id, created_at);

-- ---------- Row Level Security ----------
-- The app has no user accounts yet, so the browser (anon key) gets full
-- access. If you add Supabase Auth later, tighten these policies.

alter table public.projects enable row level security;
alter table public.project_comments enable row level security;
alter table public.project_todos enable row level security;

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

-- ---------- Seed data (optional) ----------
-- The same demo projects the app used to ship with. Delete this section
-- if you want to start with an empty tracker.

insert into public.projects
  (id, name, client, country, city, series, size_kw, stage, base_description, created_at)
values
  ('11111111-1111-4111-8111-111111111111',
   'Sofia District Heating H2 Blend', 'Toplofikacia Sofia', 'Bulgaria', 'Sofia',
   'Z Series', 1000, 'under-development',
   'Green hydrogen production for blending into the district heating gas supply, targeting a 10% H2 blend in the first phase.',
   now() - interval '120 days'),
  ('22222222-2222-4222-8222-222222222222',
   'Warsaw Glassworks Oxy-Fuel Boost', 'Vitro-Pol S.A.', 'Poland', 'Warsaw',
   'E Series', 250, 'new-lead',
   'E Series system to feed hydrogen and oxygen into the glass furnace combustion process to cut natural gas consumption.',
   now() - interval '14 days'),
  ('33333333-3333-4333-8333-333333333333',
   'Munich Bus Fleet Refuelling', 'Stadtwerke München', 'Germany', 'Munich',
   'Z Series', 2000, 'new-lead',
   'Hydrogen production and compression for a municipal bus refuelling station, initial fleet of 12 fuel-cell buses.',
   now() - interval '21 days'),
  ('44444444-4444-4444-8444-444444444444',
   'Istanbul Steel Annealing Line', 'Marmara Çelik', 'Turkey', 'Istanbul',
   'Custom', 500, 'commissioned',
   'On-site hydrogen generation replacing trucked-in cylinders for the bright annealing line, with metal hydride buffer storage.',
   now() - interval '300 days'),
  ('55555555-5555-4555-8555-555555555555',
   'Plovdiv Greenhouse CHP', 'AgroTherm EOOD', 'Bulgaria', 'Plovdiv',
   'E Series', 100, 'new-lead',
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
