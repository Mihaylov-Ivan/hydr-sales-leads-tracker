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
      'Burner Optimisation',
      'Tenders'
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

alter table public.projects
  add column if not exists lead_user_id text;

-- ---------- projects: sales stages ----------
-- Legacy "new-lead" becomes "cold-lead"; adds "hot-lead".

do $$
declare
  con_name text;
begin
  select con.conname into con_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'projects'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%stage%'
    and pg_get_constraintdef(con.oid) not ilike '%stage_change%';
  if con_name is not null then
    execute format('alter table public.projects drop constraint %I', con_name);
  end if;
end $$;

do $$
declare
  con_name text;
begin
  select con.conname into con_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'project_comments'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%stage_change%';
  if con_name is not null then
    execute format('alter table public.project_comments drop constraint %I', con_name);
  end if;
end $$;

update public.projects
  set stage = 'cold-lead'
  where stage = 'new-lead';

update public.project_comments
  set stage_change = 'cold-lead'
  where stage_change = 'new-lead';

alter table public.projects
  alter column stage set default 'cold-lead';

do $$ begin
  alter table public.projects
    add constraint projects_stage_check
    check (stage in (
      'cold-lead',
      'hot-lead',
      'under-development',
      'commissioned'
    ));
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.project_comments
    add constraint project_comments_stage_change_check
    check (
      stage_change is null
      or stage_change in (
        'cold-lead',
        'hot-lead',
        'under-development',
        'commissioned'
      )
    );
exception
  when duplicate_object then null;
end $$;

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

alter table public.project_todos
  add column if not exists owner_user_id text;

alter table public.project_comments
  add column if not exists author_user_id text;

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
