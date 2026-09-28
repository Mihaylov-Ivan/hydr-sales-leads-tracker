-- ============================================================
-- Migration 060: project co-lead + cancelled prospect status
--
-- App-only (no DDL) also in this release:
--   - Gantt auto-gen template picker (full vs phases-only)
--   - Optional Bank Guarantee phase before contract start
-- ============================================================

-- Co-lead on sales / project boards
alter table public.projects
  add column if not exists co_lead_user_id text;

create index if not exists projects_co_lead_user_id_idx
  on public.projects (co_lead_user_id);

-- Prospect close-out: migrate legacy not-interested → cancelled
update public.prospect_companies
set status = 'cancelled'
where status = 'not-interested';

update public.prospect_contacts
set status = 'cancelled'
where status = 'not-interested';
