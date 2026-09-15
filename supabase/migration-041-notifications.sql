-- ============================================================
-- Migration 041: in-app notifications (assign + @mentions)
-- Additive. Email delivery can be wired later against this table.
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id text not null references public.team_members (id) on delete cascade,
  actor_user_id text references public.team_members (id) on delete set null,
  type text not null
    check (type in ('task_assigned', 'mentioned')),
  title text not null,
  body text,
  href text,
  project_id uuid references public.projects (id) on delete cascade,
  todo_id uuid,
  comment_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_user_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_user_id)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "anon full access" on public.notifications;
create policy "anon full access"
  on public.notifications
  for all
  to anon, authenticated
  using (true)
  with check (true);
