-- ============================================================
-- Migration 006: add Tenders market category
-- Purely additive — does NOT delete or overwrite existing rows.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

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
      and pg_get_constraintdef(con.oid) ilike '%market%'
  loop
    execute format('alter table public.projects drop constraint %I', con_name);
  end loop;
end $$;

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
