-- ============================================================
-- Migration 065: per-user assignable flag for lead / task pickers
-- Default true so existing users keep appearing; hide admin/test
-- accounts from the Users page by unchecking "Assignable".
-- ============================================================

alter table public.team_members
  add column if not exists is_assignable boolean not null default true;

comment on column public.team_members.is_assignable is
  'When false, user is hidden from project lead and task assignment pickers.';

-- Hide the built-in admin account from assignment pickers by default.
update public.team_members
set is_assignable = false
where lower(coalesce(username, '')) = 'admin'
   or id = 'u-admin'
   or lower(trim(name)) = 'admin';
