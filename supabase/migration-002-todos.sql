-- ============================================================
-- Migration 002: per-project to-dos
-- Purely additive — run it in the Supabase SQL Editor on your
-- existing database; no existing data is touched.
-- ============================================================

create table if not exists public.project_todos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  -- Set when the item is checked off, cleared when unchecked
  done_at timestamptz
);

create index if not exists project_todos_project_created_idx
  on public.project_todos (project_id, created_at);

alter table public.project_todos enable row level security;

drop policy if exists "anon full access" on public.project_todos;
create policy "anon full access"
  on public.project_todos
  for all
  to anon, authenticated
  using (true)
  with check (true);
