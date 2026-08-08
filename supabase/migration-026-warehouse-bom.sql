-- ============================================================
-- migration-026: warehouse BOM (MoneyWorks PROD_*)
-- Additive only — no data loss.
-- ============================================================

create table if not exists public.warehouse_boms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  output_group text,
  product_family text,
  output_item_id uuid references public.warehouse_items (id) on delete set null,
  source_key text not null,
  qty_produced numeric not null default 0 check (qty_produced >= 0),
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists warehouse_boms_source_uidx
  on public.warehouse_boms (source_key);

create index if not exists warehouse_boms_output_item_idx
  on public.warehouse_boms (output_item_id);

create index if not exists warehouse_boms_family_idx
  on public.warehouse_boms (product_family);

comment on table public.warehouse_boms is
  'Bill of materials headers imported from MoneyWorks PROD (joined by DT_CREATED).';

create table if not exists public.warehouse_bom_lines (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references public.warehouse_boms (id) on delete cascade,
  position int not null default 0,
  component_name text not null,
  component_group text,
  component_item_id uuid references public.warehouse_items (id) on delete set null,
  qty_per_unit numeric not null check (qty_per_unit >= 0),
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  created_at timestamptz not null default now()
);

create index if not exists warehouse_bom_lines_bom_idx
  on public.warehouse_bom_lines (bom_id);

create index if not exists warehouse_bom_lines_item_idx
  on public.warehouse_bom_lines (component_item_id);

comment on table public.warehouse_bom_lines is
  'BOM component lines (qty per finished unit) from MoneyWorks PROD_ROWS + PROD_CELS.';

alter table public.warehouse_boms enable row level security;
alter table public.warehouse_bom_lines enable row level security;

drop policy if exists "anon full access" on public.warehouse_boms;
create policy "anon full access" on public.warehouse_boms
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon full access" on public.warehouse_bom_lines;
create policy "anon full access" on public.warehouse_bom_lines
  for all to anon, authenticated using (true) with check (true);
