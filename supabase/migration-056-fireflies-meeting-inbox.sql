-- ============================================================
-- Migration 056: Fireflies meeting inbox
-- Imported transcripts are staged for Hydr AI review before CRM updates.
-- Service-role API only (RLS on, no anon/authenticated policies).
-- ============================================================

create table if not exists public.fireflies_meeting_inbox (
  fireflies_transcript_id text primary key,
  title text not null default 'Untitled meeting',
  meeting_date timestamptz,
  host_email text,
  organizer_email text,
  participants jsonb not null default '[]'::jsonb,
  attendees jsonb not null default '[]'::jsonb,
  transcript_url text,
  transcript_text text not null default '',
  sentences jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'needs-clarification', 'processed', 'ignored', 'error')),
  linked_project_ids text[] not null default '{}'::text[],
  review_summary text,
  clarification_questions jsonb not null default '[]'::jsonb,
  clarification_answers jsonb not null default '[]'::jsonb,
  processed_by text references public.team_members (id) on delete set null,
  processed_at timestamptz,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fireflies_meeting_inbox_status_date_idx
  on public.fireflies_meeting_inbox (status, meeting_date asc);

create index if not exists fireflies_meeting_inbox_imported_idx
  on public.fireflies_meeting_inbox (imported_at desc);

alter table public.fireflies_meeting_inbox enable row level security;

-- Intentionally no anon/authenticated policies: access only via service role.
