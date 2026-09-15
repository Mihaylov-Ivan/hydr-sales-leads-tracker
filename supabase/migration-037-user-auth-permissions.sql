-- ============================================================
-- Migration 037: user auth + permission types
-- Purely additive — does NOT delete rows or change existing ids.
--
-- Run AFTER taking a backup (see scripts/backup-supabase.ps1).
-- Then set passwords with: node scripts/seed-admin-password.mjs
-- ============================================================

-- Auth / account columns on the existing team directory
alter table public.team_members
  add column if not exists username text,
  add column if not exists password_hash text,
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists must_change_password boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

-- Unique username when present (allows null for legacy rows until backfilled)
create unique index if not exists team_members_username_uidx
  on public.team_members (lower(username))
  where username is not null;

-- Permission types assigned to users (many-to-many)
create table if not exists public.user_permission_types (
  user_id text not null references public.team_members (id) on delete cascade,
  permission_type text not null
    check (permission_type in ('sales', 'finance', 'warehouse', 'production')),
  created_at timestamptz not null default now(),
  primary key (user_id, permission_type)
);

create index if not exists user_permission_types_type_idx
  on public.user_permission_types (permission_type);

alter table public.user_permission_types enable row level security;

drop policy if exists "anon full access" on public.user_permission_types;
create policy "anon full access"
  on public.user_permission_types
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Backfill usernames for the original seeded roster (ids preserved)
update public.team_members
set username = 'andrew', updated_at = now()
where id = 'u-andrew' and (username is null or username = '');

update public.team_members
set username = 'maria', updated_at = now()
where id = 'u-maria' and (username is null or username = '');

update public.team_members
set username = 'daniel', updated_at = now()
where id = 'u-daniel' and (username is null or username = '');

update public.team_members
set username = 'irina', updated_at = now()
where id = 'u-irina' and (username is null or username = '');

-- Admin account (full access). Password hash set via seed-admin-password.mjs
insert into public.team_members (id, name, username, is_admin, is_active, must_change_password)
values ('u-admin', 'Admin', 'admin', true, true, true)
on conflict (id) do update
set
  name = excluded.name,
  username = coalesce(public.team_members.username, excluded.username),
  is_admin = true,
  is_active = true,
  updated_at = now();

-- Give existing non-admin roster sales by default so they can keep using
-- Prospecting / Sales Projects after login (admin can change later).
insert into public.user_permission_types (user_id, permission_type)
select m.id, 'sales'
from public.team_members m
where m.id in ('u-andrew', 'u-maria', 'u-daniel', 'u-irina')
  and coalesce(m.is_admin, false) = false
on conflict do nothing;
