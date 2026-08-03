-- ============================================================
-- Migration 020: add "To Contact" sales stage
--
-- Tracking-only column for leads not yet contacted.
-- Excluded from pipeline conversion / capacity / finance metrics
-- in the app. Purely additive — does NOT delete or remaps rows.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- Drop existing stage check on projects (name may vary)
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

-- Drop stage_change check on comments
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

-- Drop stage check on project_stage_history (if present)
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
      and rel.relname = 'project_stage_history'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%stage%'
  loop
    execute format(
      'alter table public.project_stage_history drop constraint %I',
      con_name
    );
  end loop;
end $$;

do $$ begin
  alter table public.projects
    add constraint projects_stage_check
    check (stage in (
      'to-contact',
      'cold-lead',
      'hot-lead',
      'under-development',
      'commissioned',
      'cancelled'
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
        'to-contact',
        'cold-lead',
        'hot-lead',
        'under-development',
        'commissioned',
        'cancelled'
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.project_stage_history
    add constraint project_stage_history_stage_check
    check (stage in (
      'to-contact',
      'cold-lead',
      'hot-lead',
      'under-development',
      'commissioned',
      'cancelled'
    ));
exception
  when duplicate_object then null;
end $$;

comment on constraint projects_stage_check on public.projects is
  'Includes to-contact (tracking only; excluded from sales metrics in the app).';
