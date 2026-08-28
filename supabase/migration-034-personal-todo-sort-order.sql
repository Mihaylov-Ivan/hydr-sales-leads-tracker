-- ============================================================
-- Migration 034: personal todo manual priority (sort order)
-- Additive — run in the Supabase SQL Editor.
-- ============================================================

alter table public.personal_todos
  add column if not exists sort_order integer not null default 0;

comment on column public.personal_todos.sort_order is
  'Manual priority within a status column — lower values appear first';

-- Backfill existing rows using creation time within each status.
with ranked as (
  select
    id,
    (row_number() over (
      partition by status
      order by created_at asc, id asc
    ) - 1) * 10 as next_sort_order
  from public.personal_todos
)
update public.personal_todos t
set sort_order = ranked.next_sort_order
from ranked
where t.id = ranked.id;

create index if not exists personal_todos_status_sort_idx
  on public.personal_todos (status, sort_order, created_at);
