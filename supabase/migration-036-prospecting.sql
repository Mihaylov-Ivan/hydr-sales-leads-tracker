-- Additive prospecting schema (Phase 1).
-- Safe to run when tables already exist.

create table if not exists public.prospect_companies (
  id uuid primary key,
  name text not null,
  country text not null default '',
  city text not null default '',
  site_name text not null default '',
  website text not null default '',
  industry text not null default '',
  market text not null,
  product text not null,
  source text not null default 'email',
  priority text not null default 'medium',
  owner_id text,
  status text not null default 'target-identified',
  notes text not null default '',
  strategy_why text not null default '',
  strategy_angle text not null default '',
  strategy_message text not null default '',
  potential_value numeric,
  existing_relationship text not null default '',
  next_action text not null default '',
  next_action_at date,
  last_activity_at timestamptz,
  promoted_project_id uuid references public.projects (id) on delete set null,
  qualification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospect_contacts (
  id uuid primary key,
  company_id uuid not null references public.prospect_companies (id) on delete cascade,
  name text not null,
  title text not null default '',
  department text not null default '',
  email text not null default '',
  phone text not null default '',
  linkedin_url text not null default '',
  preferred_method text not null default 'email',
  source text not null default 'email',
  status text not null default 'target-identified',
  priority text not null default 'medium',
  owner_id text,
  is_primary boolean not null default false,
  notes text not null default '',
  contact_objective text not null default '',
  outreach_angle text not null default '',
  personalization_note text not null default '',
  draft_message text not null default '',
  planned_channel text,
  planned_contact_date date,
  prepared_at timestamptz,
  first_contacted_at timestamptz,
  last_contacted_at timestamptz,
  next_follow_up_at date,
  follow_up_reason text not null default '',
  outreach_attempts integer not null default 0,
  response_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospect_activities (
  id uuid primary key,
  company_id uuid not null references public.prospect_companies (id) on delete cascade,
  contact_id uuid references public.prospect_contacts (id) on delete set null,
  user_id text,
  channel text not null,
  result text not null,
  summary text not null default '',
  next_action text not null default '',
  next_action_at date,
  counts_as_new_contact boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.prospecting_targets (
  id integer primary key default 1 check (id = 1),
  monthly_contact_target integer not null default 80,
  weekly_contact_target integer not null default 20,
  market_allocation jsonb not null default '{
    "Burner Optimisation": 30,
    "Cement": 25,
    "Power Plants": 20,
    "Clean H2": 15,
    "Funding": 5,
    "Tenders": 5
  }'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.prospecting_targets (id)
values (1)
on conflict (id) do nothing;

create index if not exists prospect_companies_status_idx
  on public.prospect_companies (status);
create index if not exists prospect_companies_owner_idx
  on public.prospect_companies (owner_id);
create index if not exists prospect_companies_market_idx
  on public.prospect_companies (market);
create index if not exists prospect_contacts_company_idx
  on public.prospect_contacts (company_id);
create index if not exists prospect_contacts_status_idx
  on public.prospect_contacts (status);
create index if not exists prospect_contacts_follow_up_idx
  on public.prospect_contacts (next_follow_up_at);
create index if not exists prospect_activities_company_idx
  on public.prospect_activities (company_id);
create index if not exists prospect_activities_created_idx
  on public.prospect_activities (created_at desc);

alter table public.prospect_companies enable row level security;
alter table public.prospect_contacts enable row level security;
alter table public.prospect_activities enable row level security;
alter table public.prospecting_targets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'prospect_companies'
      and policyname = 'prospect_companies_anon_all'
  ) then
    create policy prospect_companies_anon_all on public.prospect_companies
      for all to anon using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'prospect_contacts'
      and policyname = 'prospect_contacts_anon_all'
  ) then
    create policy prospect_contacts_anon_all on public.prospect_contacts
      for all to anon using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'prospect_activities'
      and policyname = 'prospect_activities_anon_all'
  ) then
    create policy prospect_activities_anon_all on public.prospect_activities
      for all to anon using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'prospecting_targets'
      and policyname = 'prospecting_targets_anon_all'
  ) then
    create policy prospecting_targets_anon_all on public.prospecting_targets
      for all to anon using (true) with check (true);
  end if;
end $$;
