-- ============================================================
-- Migration 031: personal (persona) to-dos
-- Additive — not linked to sales projects. Run in the Supabase
-- SQL Editor; existing tables and rows are untouched.
-- ============================================================

create table if not exists public.personal_todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('cancelled', 'todo', 'doing', 'done')),
  due_date date,
  start_date date,
  end_date date,
  owner_user_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists personal_todos_status_created_idx
  on public.personal_todos (status, created_at);

create table if not exists public.personal_todo_comments (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.personal_todos (id) on delete cascade,
  text text not null,
  author_user_id text,
  created_at timestamptz not null default now()
);

create index if not exists personal_todo_comments_todo_created_idx
  on public.personal_todo_comments (todo_id, created_at);

alter table public.personal_todos enable row level security;
alter table public.personal_todo_comments enable row level security;

drop policy if exists "anon full access" on public.personal_todos;
create policy "anon full access"
  on public.personal_todos
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "anon full access" on public.personal_todo_comments;
create policy "anon full access"
  on public.personal_todo_comments
  for all
  to anon, authenticated
  using (true)
  with check (true);
