-- ============================================================
-- Migration 054: unify project todo kinds to Action Items only
--
-- - Migrates legacy `question` and `client-action` rows to `our-action`
-- - Tightens the kind check constraint to only allow `our-action`
-- - Answer column already exists and is kept for all action items
--
-- Run in the Supabase SQL Editor (or via your migration runner).
-- ============================================================

-- 1) Move Questions to Clear + Action Items (Client) → Action Items
update public.project_todos
set kind = 'our-action'
where kind in ('question', 'client-action')
   or kind is null
   or kind not in ('our-action');

-- 2) Replace the kind check constraint
alter table public.project_todos
  drop constraint if exists project_todos_kind_check;

alter table public.project_todos
  alter column kind set default 'our-action';

alter table public.project_todos
  alter column kind set not null;

alter table public.project_todos
  add constraint project_todos_kind_check
  check (kind in ('our-action'));
