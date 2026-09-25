-- ============================================================
-- Migration 057: AI email-review queue + project summary metadata
-- Proposal-only email ingestion. The raw email is NOT stored; only a short
-- provenance excerpt/hash and structured proposed CRM deltas are retained.
-- ============================================================

alter table public.projects
  add column if not exists ai_summary_updated_at timestamptz;

create table if not exists public.ai_suggested_updates (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null default gen_random_uuid(),
  user_id text not null,
  project_id uuid not null references public.projects (id) on delete cascade,

  source_type text not null default 'manual-email'
    check (source_type in ('manual-email')),
  source_label text,
  source_hash text not null,
  source_excerpt text,

  operation text not null
    check (operation in (
      'add_project_comment',
      'update_project_fields',
      'create_project_task',
      'add_project_contact',
      'update_project_contact',
      'change_project_stage',
      'clarification'
    )),
  title text not null,
  rationale text,
  confidence text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),

  payload jsonb not null default '{}'::jsonb,
  existing_value jsonb,
  proposed_value jsonb,

  status text not null default 'pending'
    check (status in ('pending', 'needs-clarification', 'applied', 'rejected')),
  dedupe_key text not null,
  review_note text,

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  applied_at timestamptz
);

create unique index if not exists ai_suggested_updates_dedupe_idx
  on public.ai_suggested_updates (user_id, project_id, dedupe_key);

create index if not exists ai_suggested_updates_user_status_idx
  on public.ai_suggested_updates (user_id, status, created_at desc);

create index if not exists ai_suggested_updates_project_idx
  on public.ai_suggested_updates (project_id, created_at desc);

alter table public.ai_suggested_updates enable row level security;

-- Intentionally no anon/authenticated policies.
-- The application accesses this table only from authenticated server routes
-- using the Supabase service-role client, matching hydr_ai_chats.
