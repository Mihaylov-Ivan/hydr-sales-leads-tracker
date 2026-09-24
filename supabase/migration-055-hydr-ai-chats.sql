-- ============================================================
-- Migration 055: Hydr AI chat history (per user)
-- Stored via service-role API only (RLS on, no anon policies).
-- ============================================================

create table if not exists public.hydr_ai_chats (
  id text primary key,
  user_id text not null references public.team_members (id) on delete cascade,
  title text not null default 'New chat',
  logs jsonb not null default '[]'::jsonb,
  tab_open boolean not null default true,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hydr_ai_chats_user_updated_idx
  on public.hydr_ai_chats (user_id, updated_at desc);

create index if not exists hydr_ai_chats_user_active_idx
  on public.hydr_ai_chats (user_id)
  where is_active = true;

alter table public.hydr_ai_chats enable row level security;

-- Intentionally no anon/authenticated policies: access only via service role.
