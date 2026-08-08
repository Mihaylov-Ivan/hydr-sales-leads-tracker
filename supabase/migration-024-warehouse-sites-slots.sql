-- ============================================================
-- migration-024: warehouse sites × slots, groups, serials, min/max
-- Additive / reorganisation — migrates existing location_type rows to
-- site=ELX + slot (project/spare/buffer); unallocated → buffer.
-- ============================================================

-- Product groups (MoneyWorks GRUPI)
create table if not exists public.warehouse_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.warehouse_groups (id) on delete set null,
  source_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists warehouse_groups_source_key_uidx
  on public.warehouse_groups (source_key)
  where source_key is not null;

-- Catalog extras
alter table public.warehouse_items
  add column if not exists group_id uuid references public.warehouse_groups (id) on delete set null,
  add column if not exists barcode text,
  add column if not exists min_qty numeric check (min_qty is null or min_qty >= 0),
  add column if not exists max_qty numeric check (max_qty is null or max_qty >= 0),
  add column if not exists tracks_serial boolean not null default false;

create index if not exists warehouse_items_group_idx
  on public.warehouse_items (group_id);

-- Lots: optional expense + import provenance
alter table public.warehouse_lots
  alter column expense_id drop not null;

alter table public.warehouse_lots
  add column if not exists source_sklad text;

-- Balances: site + slot (replaces flat location_type)
alter table public.warehouse_balances
  add column if not exists site text,
  add column if not exists slot text,
  add column if not exists source_sklad text;

update public.warehouse_balances
set
  site = coalesce(site, 'ELX'),
  slot = case
    when coalesce(slot, '') in ('project', 'spare', 'buffer') then slot
    when location_type = 'project' then 'project'
    when location_type = 'spare' then 'spare'
    when location_type = 'buffer' then 'buffer'
    when location_type = 'unallocated' then 'buffer'
    else 'spare'
  end
where site is null or slot is null;

alter table public.warehouse_balances
  alter column site set default 'ELX',
  alter column slot set default 'spare';

update public.warehouse_balances set site = 'ELX' where site is null;
update public.warehouse_balances set slot = 'spare' where slot is null;

alter table public.warehouse_balances
  alter column site set not null,
  alter column slot set not null;

alter table public.warehouse_balances
  drop constraint if exists warehouse_balances_location_type_check;

alter table public.warehouse_balances
  drop constraint if exists warehouse_balances_project_loc;

alter table public.warehouse_balances
  drop constraint if exists warehouse_balances_site_check;

alter table public.warehouse_balances
  add constraint warehouse_balances_site_check
    check (site in ('ELX', 'MH', 'Van'));

alter table public.warehouse_balances
  drop constraint if exists warehouse_balances_slot_check;

alter table public.warehouse_balances
  add constraint warehouse_balances_slot_check
    check (slot in ('project', 'spare', 'buffer'));

alter table public.warehouse_balances
  add constraint warehouse_balances_project_slot check (
    (slot = 'project' and project_id is not null)
    or (slot <> 'project' and project_id is null)
  );

-- location_type becomes legacy nullable (kept for safety; app uses site/slot)
alter table public.warehouse_balances
  alter column location_type drop not null;

drop index if exists warehouse_balances_lot_loc_uidx;

create unique index if not exists warehouse_balances_lot_site_slot_uidx
  on public.warehouse_balances (
    lot_id,
    site,
    slot,
    (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

-- Movements: site + slot columns
alter table public.warehouse_movements
  add column if not exists from_site text,
  add column if not exists from_slot text,
  add column if not exists to_site text,
  add column if not exists to_slot text;

update public.warehouse_movements
set
  from_site = coalesce(from_site, case when from_location_type is not null then 'ELX' else null end),
  from_slot = coalesce(
    from_slot,
    case
      when from_location_type = 'project' then 'project'
      when from_location_type = 'spare' then 'spare'
      when from_location_type = 'buffer' then 'buffer'
      when from_location_type = 'unallocated' then 'buffer'
      else null
    end
  ),
  to_site = coalesce(to_site, case when to_location_type is not null then 'ELX' else null end),
  to_slot = coalesce(
    to_slot,
    case
      when to_location_type = 'project' then 'project'
      when to_location_type = 'spare' then 'spare'
      when to_location_type = 'buffer' then 'buffer'
      when to_location_type = 'unallocated' then 'buffer'
      else null
    end
  )
where from_site is null
   or from_slot is null
   or to_site is null
   or to_slot is null
   or from_location_type is not null
   or to_location_type is not null;

alter table public.warehouse_movements
  drop constraint if exists warehouse_movements_from_site_check;

alter table public.warehouse_movements
  add constraint warehouse_movements_from_site_check
    check (from_site is null or from_site in ('ELX', 'MH', 'Van'));

alter table public.warehouse_movements
  drop constraint if exists warehouse_movements_to_site_check;

alter table public.warehouse_movements
  add constraint warehouse_movements_to_site_check
    check (to_site is null or to_site in ('ELX', 'MH', 'Van'));

alter table public.warehouse_movements
  drop constraint if exists warehouse_movements_from_slot_check;

alter table public.warehouse_movements
  add constraint warehouse_movements_from_slot_check
    check (from_slot is null or from_slot in ('project', 'spare', 'buffer'));

alter table public.warehouse_movements
  drop constraint if exists warehouse_movements_to_slot_check;

alter table public.warehouse_movements
  add constraint warehouse_movements_to_slot_check
    check (to_slot is null or to_slot in ('project', 'spare', 'buffer'));

-- Serial registry
create table if not exists public.warehouse_serials (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.warehouse_items (id) on delete restrict,
  lot_id uuid references public.warehouse_lots (id) on delete set null,
  serial text not null,
  site text not null check (site in ('ELX', 'MH', 'Van')),
  slot text not null check (slot in ('project', 'spare', 'buffer')),
  project_id uuid references public.projects (id) on delete restrict,
  qty numeric not null default 1 check (qty > 0),
  status text not null default 'in_stock'
    check (status in ('in_stock', 'consumed', 'disposed')),
  source_sklad text,
  created_at timestamptz not null default now(),
  constraint warehouse_serials_project_slot check (
    (slot = 'project' and project_id is not null)
    or (slot <> 'project' and project_id is null)
  )
);

create index if not exists warehouse_serials_item_idx
  on public.warehouse_serials (item_id);

create index if not exists warehouse_serials_lot_idx
  on public.warehouse_serials (lot_id);

create unique index if not exists warehouse_serials_item_serial_uidx
  on public.warehouse_serials (item_id, serial)
  where status = 'in_stock';

comment on table public.warehouse_groups is
  'Warehouse catalog product groups (from MoneyWorks GRUPI).';
comment on table public.warehouse_serials is
  'Serialized stock units (from MoneyWorks SER_NO).';
comment on column public.warehouse_balances.site is
  'Physical campus: ELX, MH, or Van.';
comment on column public.warehouse_balances.slot is
  'Role at site: project, spare, or buffer.';

alter table public.warehouse_groups enable row level security;
alter table public.warehouse_serials enable row level security;

drop policy if exists "anon full access" on public.warehouse_groups;
create policy "anon full access" on public.warehouse_groups
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon full access" on public.warehouse_serials;
create policy "anon full access" on public.warehouse_serials
  for all to anon, authenticated using (true) with check (true);
