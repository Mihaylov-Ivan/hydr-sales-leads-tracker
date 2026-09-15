-- ============================================================
-- Migration 040: per-user project reminder settings
-- Additive — does not remove project-level reminder columns.
-- Each user can enable/configure their own follow-up cadence
-- per project and receive their own reminder todos.
-- ============================================================

create table if not exists public.project_user_reminders (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id text not null references public.team_members (id) on delete cascade,
  email_reminder_days integer not null default 7
    check (email_reminder_days >= 1),
  email_reminder_enabled boolean not null default true,
  last_client_contact_at date not null default (CURRENT_DATE),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_user_reminders_user_idx
  on public.project_user_reminders (user_id);

create index if not exists project_user_reminders_project_idx
  on public.project_user_reminders (project_id);

alter table public.project_user_reminders enable row level security;

drop policy if exists "anon full access" on public.project_user_reminders;
create policy "anon full access"
  on public.project_user_reminders
  for all
  to anon, authenticated
  using (true)
  with check (true);
