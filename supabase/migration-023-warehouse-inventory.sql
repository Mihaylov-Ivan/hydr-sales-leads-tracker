-- ============================================================
-- migration-023: warehouse inventory tables
-- Expenses/cash stay in CSV + local financials (warehouse_lot_id link).
-- Catalog, lots, balances, movements live here (incl. unit costs for stock value).
-- Additive only — no data loss.
-- ============================================================

create table if not exists public.warehouse_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text,
  unit text not null default 'pcs',
  default_material_kind text not null default 'materials'
    check (default_material_kind in ('materials', 'installation', 'maintenance')),
  created_at timestamptz not null default now()
);

create table if not exists public.warehouse_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.warehouse_items (id) on delete restrict,
  qty_received numeric not null check (qty_received > 0),
  unit_cost_inc_vat numeric not null default 0 check (unit_cost_inc_vat >= 0),
  unit_cost_ex_vat numeric not null default 0 check (unit_cost_ex_vat >= 0),
  received_at date not null,
  purchase_project_id uuid not null references public.projects (id) on delete restrict,
  expense_id text not null,
  category text not null
    check (category in ('man-hr', 'materials', 'installation', 'maintenance', 'admin')),
  subcategory text,
  supplier text,
  notes text,
  label text,
  created_at timestamptz not null default now()
);

create table if not exists public.warehouse_balances (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.warehouse_lots (id) on delete cascade,
  location_type text not null
    check (location_type in ('project', 'spare', 'buffer', 'unallocated')),
  project_id uuid references public.projects (id) on delete restrict,
  qty numeric not null check (qty > 0),
  constraint warehouse_balances_project_loc check (
    (location_type = 'project' and project_id is not null)
    or (location_type <> 'project' and project_id is null)
  )
);

create unique index if not exists warehouse_balances_lot_loc_uidx
  on public.warehouse_balances (
    lot_id,
    location_type,
    (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

create table if not exists public.warehouse_movements (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.warehouse_lots (id) on delete cascade,
  action text not null
    check (action in ('receive', 'allocate', 'transfer', 'consume', 'adjust')),
  qty numeric not null check (qty > 0),
  from_location_type text
    check (
      from_location_type is null
      or from_location_type in ('project', 'spare', 'buffer', 'unallocated')
    ),
  from_project_id uuid references public.projects (id) on delete set null,
  to_location_type text
    check (
      to_location_type is null
      or to_location_type in ('project', 'spare', 'buffer', 'unallocated')
    ),
  to_project_id uuid references public.projects (id) on delete set null,
  occurred_at timestamptz not null default now(),
  note text
);

create index if not exists warehouse_lots_item_idx
  on public.warehouse_lots (item_id);

create index if not exists warehouse_lots_purchase_project_idx
  on public.warehouse_lots (purchase_project_id);

create index if not exists warehouse_balances_lot_idx
  on public.warehouse_balances (lot_id);

create index if not exists warehouse_movements_lot_idx
  on public.warehouse_movements (lot_id, occurred_at desc);

comment on table public.warehouse_items is
  'Warehouse catalog components.';
comment on table public.warehouse_lots is
  'Receipt lots; cashflow remains on project expenses (CSV) via expense_id / warehouse_lot_id.';
comment on table public.warehouse_balances is
  'Qty on hand by lot and location.';
comment on table public.warehouse_movements is
  'Movement history for warehouse lots.';

alter table public.warehouse_items enable row level security;
alter table public.warehouse_lots enable row level security;
alter table public.warehouse_balances enable row level security;
alter table public.warehouse_movements enable row level security;

drop policy if exists "anon full access" on public.warehouse_items;
create policy "anon full access" on public.warehouse_items
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon full access" on public.warehouse_lots;
create policy "anon full access" on public.warehouse_lots
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon full access" on public.warehouse_balances;
create policy "anon full access" on public.warehouse_balances
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon full access" on public.warehouse_movements;
create policy "anon full access" on public.warehouse_movements
  for all to anon, authenticated using (true) with check (true);
