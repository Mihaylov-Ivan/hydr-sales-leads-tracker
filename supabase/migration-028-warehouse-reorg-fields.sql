-- ============================================================
-- migration-028: warehouse reorg metadata on catalog items
-- Additive only — supports type taxonomy + supplier/system tags
-- without deleting existing inventory rows.
-- ============================================================

alter table public.warehouse_items
  add column if not exists preferred_supplier text,
  add column if not exists system_tags jsonb not null default '[]'::jsonb,
  add column if not exists legacy_group_name text,
  add column if not exists name_original text;

comment on column public.warehouse_items.preferred_supplier is
  'Canonical supplier from reorganisation (ex-vendor folders); lots may still have their own supplier.';
comment on column public.warehouse_items.system_tags is
  'Product/system context tags e.g. electrolyzer, scrubber, gas-analyzer, metal-hydride.';
comment on column public.warehouse_items.legacy_group_name is
  'MoneyWorks group name before type-taxonomy remap.';
comment on column public.warehouse_items.name_original is
  'Display name before naming normalisation (if changed).';

create index if not exists warehouse_items_preferred_supplier_idx
  on public.warehouse_items (preferred_supplier)
  where preferred_supplier is not null;

create index if not exists warehouse_items_system_tags_gin
  on public.warehouse_items using gin (system_tags);
