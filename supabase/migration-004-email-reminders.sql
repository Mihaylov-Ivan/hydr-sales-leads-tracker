-- ============================================================
-- Migration 004: client email follow-up reminders
-- Purely additive — safe on existing data.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

alter table public.projects
  add column if not exists last_client_contact_at date;

alter table public.projects
  add column if not exists email_reminder_days integer;

alter table public.projects
  add column if not exists email_reminder_enabled boolean;

-- Backfill from creation date; default window = 7 days
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
