-- ============================================================
-- migration-025: MoneyWorks SKLAD → project mapping
-- Additive only — no data loss.
-- ============================================================

create table if not exists public.warehouse_sklad_maps (
  id uuid primary key default gen_random_uuid(),
  source_sklad text not null,
  project_id uuid not null references public.projects (id) on delete restrict,
  site text not null default 'ELX'
    check (site in ('ELX', 'MH', 'Van')),
  slot text not null default 'project'
    check (slot in ('project', 'spare', 'buffer')),
  created_at timestamptz not null default now(),
  constraint warehouse_sklad_maps_project_slot check (
    (slot = 'project')
    or (slot <> 'project')
  )
);

create unique index if not exists warehouse_sklad_maps_source_uidx
  on public.warehouse_sklad_maps (source_sklad);

create index if not exists warehouse_sklad_maps_project_idx
  on public.warehouse_sklad_maps (project_id);

comment on table public.warehouse_sklad_maps is
  'Maps MoneyWorks System-* SKLAD names to app projects (site×slot).';

alter table public.warehouse_sklad_maps enable row level security;

drop policy if exists "anon full access" on public.warehouse_sklad_maps;
create policy "anon full access" on public.warehouse_sklad_maps
  for all to anon, authenticated using (true) with check (true);
