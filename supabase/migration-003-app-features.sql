-- ============================================================
-- Migration 003: markets, todo kinds, contacts, financials
-- Purely additive — safe to run on an existing database.
-- Does NOT delete or overwrite any existing rows.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ---------- projects: market + financial scalars ----------

alter table public.projects
  add column if not exists market text;

update public.projects
  set market = 'Clean H2'
  where market is null;

alter table public.projects
  alter column market set default 'Clean H2';

alter table public.projects
  alter column market set not null;

do $$ begin
  alter table public.projects
    add constraint projects_market_check
    check (market in (
      'Cement',
      'Power Plants',
      'Funding',
      'Clean H2',
      'Burner Optimisation'
    ));
exception
  when duplicate_object then null;
end $$;

alter table public.projects
  add column if not exists contract_value numeric;

alter table public.projects
  add column if not exists contract_signed_date date;

alter table public.projects
  add column if not exists expenses numeric;

alter table public.projects
  add column if not exists expected_profit numeric;

-- ---------- project_todos: kind, answer, due_date ----------

alter table public.project_todos
  add column if not exists kind text;

-- Existing to-dos become "Action Items (Us)"
update public.project_todos
  set kind = 'our-action'
  where kind is null;

alter table public.project_todos
  alter column kind set default 'our-action';

alter table public.project_todos
  alter column kind set not null;

do $$ begin
  alter table public.project_todos
    add constraint project_todos_kind_check
    check (kind in ('question', 'our-action', 'client-action'));
exception
  when duplicate_object then null;
end $$;

alter table public.project_todos
  add column if not exists answer text;

alter table public.project_todos
  add column if not exists due_date date;

-- ---------- project_contacts ----------

create table if not exists public.project_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text,
  email text,
  phone text,
  position text,
  created_at timestamptz not null default now()
);

create index if not exists project_contacts_project_created_idx
  on public.project_contacts (project_id, created_at);

alter table public.project_contacts enable row level security;

drop policy if exists "anon full access" on public.project_contacts;
create policy "anon full access"
  on public.project_contacts
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ---------- project_milestones (before payments/expenses FKs) ----------

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

create index if not exists project_milestones_project_date_idx
  on public.project_milestones (project_id, date);

alter table public.project_milestones enable row level security;

drop policy if exists "anon full access" on public.project_milestones;
create policy "anon full access"
  on public.project_milestones
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ---------- project_payments ----------

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

create index if not exists project_payments_project_due_idx
  on public.project_payments (project_id, due_date);

create index if not exists project_payments_milestone_idx
  on public.project_payments (milestone_id);

alter table public.project_payments enable row level security;

drop policy if exists "anon full access" on public.project_payments;
create policy "anon full access"
  on public.project_payments
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- In case an older payments table existed without milestone_id
alter table public.project_payments
  add column if not exists percent numeric;

alter table public.project_payments
  add column if not exists label text;

alter table public.project_payments
  add column if not exists milestone_id uuid references public.project_milestones (id) on delete set null;

-- ---------- project_expenses (dated expense schedule) ----------

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

create index if not exists project_expenses_project_due_idx
  on public.project_expenses (project_id, due_date);

create index if not exists project_expenses_milestone_idx
  on public.project_expenses (milestone_id);

alter table public.project_expenses enable row level security;

drop policy if exists "anon full access" on public.project_expenses;
create policy "anon full access"
  on public.project_expenses
  for all
  to anon, authenticated
  using (true)
  with check (true);
