-- ============================================================
-- Migration 009: shared team members directory
-- Purely additive — does NOT delete rows.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

create table if not exists public.team_members (
  id text primary key,
  name text not null,
  email text,
  created_at timestamptz not null default now()
);

create index if not exists team_members_name_idx
  on public.team_members (name);

alter table public.team_members enable row level security;

drop policy if exists "anon full access" on public.team_members;
create policy "anon full access"
  on public.team_members
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Seed the original in-app roster so existing lead/owner ids keep resolving.
insert into public.team_members (id, name)
values
  ('u-andrew', 'Andrew'),
  ('u-maria', 'Maria'),
  ('u-daniel', 'Daniel'),
  ('u-irina', 'Irina')
on conflict (id) do nothing;
