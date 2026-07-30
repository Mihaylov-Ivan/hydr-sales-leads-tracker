-- ============================================================
-- Migration 005: ownership, follow-up reminders, sales stages
-- Target: existing DB matching the live schema you shared.
-- Purely additive / remapping — does NOT delete rows or tables.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run (idempotent where possible).
-- ============================================================

-- ---------- 1) projects: ownership + follow-up columns ----------

alter table public.projects
  add column if not exists lead_user_id text;

alter table public.projects
  add column if not exists last_client_contact_at date;

alter table public.projects
  add column if not exists email_reminder_days integer;

alter table public.projects
  add column if not exists email_reminder_enabled boolean;

-- Backfill reminder clock from each project's creation date
update public.projects
  set last_client_contact_at = created_at::date
  where last_client_contact_at is null;

update public.projects
  set email_reminder_days = 7
  where email_reminder_days is null;

update public.projects
  set email_reminder_enabled = true
  where email_reminder_enabled is null;

alter table public.projects
  alter column last_client_contact_at set default current_date;

alter table public.projects
  alter column email_reminder_days set default 7;

alter table public.projects
  alter column email_reminder_enabled set default true;

alter table public.projects
  alter column last_client_contact_at set not null;

alter table public.projects
  alter column email_reminder_days set not null;

alter table public.projects
  alter column email_reminder_enabled set not null;

do $$ begin
  alter table public.projects
    add constraint projects_email_reminder_days_check
    check (email_reminder_days > 0);
exception
  when duplicate_object then null;
end $$;

-- ---------- 2) project_todos: responsible owner ----------

alter table public.project_todos
  add column if not exists owner_user_id text;

-- ---------- 3) project_comments: author user id ----------

alter table public.project_comments
  add column if not exists author_user_id text;

-- ---------- 4) sales stages: new-lead → cold-lead, add hot-lead ----------
-- Drop old check constraints first (names may vary), then remap, then recreate.

do $$
declare
  con_name text;
begin
  for con_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'projects'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%stage%'
      and pg_get_constraintdef(con.oid) not ilike '%stage_change%'
  loop
    execute format('alter table public.projects drop constraint %I', con_name);
  end loop;
end $$;

do $$
declare
  con_name text;
begin
  for con_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'project_comments'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%stage_change%'
  loop
    execute format(
      'alter table public.project_comments drop constraint %I',
      con_name
    );
  end loop;
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

-- ---------- 5) ON DELETE CASCADE for child tables ----------
-- Keeps existing rows; only changes FK behavior for future project deletes.

do $$ begin
  alter table public.project_comments
    drop constraint if exists project_comments_project_id_fkey;
  alter table public.project_comments
    add constraint project_comments_project_id_fkey
    foreign key (project_id) references public.projects (id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.project_todos
    drop constraint if exists project_todos_project_id_fkey;
  alter table public.project_todos
    add constraint project_todos_project_id_fkey
    foreign key (project_id) references public.projects (id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.project_contacts
    drop constraint if exists project_contacts_project_id_fkey;
  alter table public.project_contacts
    add constraint project_contacts_project_id_fkey
    foreign key (project_id) references public.projects (id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.project_milestones
    drop constraint if exists project_milestones_project_id_fkey;
  alter table public.project_milestones
    add constraint project_milestones_project_id_fkey
    foreign key (project_id) references public.projects (id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.project_payments
    drop constraint if exists project_payments_project_id_fkey;
  alter table public.project_payments
    add constraint project_payments_project_id_fkey
    foreign key (project_id) references public.projects (id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.project_payments
    drop constraint if exists project_payments_milestone_id_fkey;
  alter table public.project_payments
    add constraint project_payments_milestone_id_fkey
    foreign key (milestone_id) references public.project_milestones (id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.project_expenses
    drop constraint if exists project_expenses_project_id_fkey;
  alter table public.project_expenses
    add constraint project_expenses_project_id_fkey
    foreign key (project_id) references public.projects (id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.project_expenses
    drop constraint if exists project_expenses_milestone_id_fkey;
  alter table public.project_expenses
    add constraint project_expenses_milestone_id_fkey
    foreign key (milestone_id) references public.project_milestones (id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

-- ---------- 6) helpful indexes (no data change) ----------

create index if not exists projects_lead_user_id_idx
  on public.projects (lead_user_id);

create index if not exists project_todos_owner_user_id_idx
  on public.project_todos (owner_user_id);

create index if not exists project_comments_author_user_id_idx
  on public.project_comments (author_user_id);

create index if not exists projects_last_client_contact_idx
  on public.projects (last_client_contact_at);
