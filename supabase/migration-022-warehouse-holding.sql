-- ============================================================
-- migration-022: warehouse holding project flag + size_kw >= 0
-- Additive / constraint relaxation only — no data loss.
-- ============================================================

-- Mark the internal Warehouse / Central stock project (hidden from Board).
alter table public.projects
  add column if not exists is_warehouse_holding boolean not null default false;

comment on column public.projects.is_warehouse_holding is
  'Internal holding project for spare/buffer warehouse stock; hidden from sales Board.';

-- Holding project uses size_kw = 0; relax check without dropping rows.
alter table public.projects
  drop constraint if exists projects_size_kw_check;

alter table public.projects
  add constraint projects_size_kw_check check (size_kw >= 0);

create index if not exists projects_warehouse_holding_idx
  on public.projects (is_warehouse_holding)
  where is_warehouse_holding = true;
