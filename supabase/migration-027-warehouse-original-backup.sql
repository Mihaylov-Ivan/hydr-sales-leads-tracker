-- ============================================================
-- migration-027: warehouse original backup store
-- Additive only — holds frozen copies of live warehouse rows
-- before reorganisation / remapping migrations.
-- ============================================================

create table if not exists public.warehouse_original_backups (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  note text,
  source text not null default 'live-db',
  counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists warehouse_original_backups_label_uidx
  on public.warehouse_original_backups (label);

comment on table public.warehouse_original_backups is
  'Metadata for a frozen warehouse snapshot taken before destructive remaps.';

create table if not exists public.warehouse_original_rows (
  id uuid primary key default gen_random_uuid(),
  backup_id uuid not null references public.warehouse_original_backups (id) on delete cascade,
  table_name text not null,
  row_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists warehouse_original_rows_uidx
  on public.warehouse_original_rows (backup_id, table_name, row_id);

create index if not exists warehouse_original_rows_backup_table_idx
  on public.warehouse_original_rows (backup_id, table_name);

comment on table public.warehouse_original_rows is
  'Row-level JSON payloads of live warehouse tables at backup time (no data loss).';

alter table public.warehouse_original_backups enable row level security;
alter table public.warehouse_original_rows enable row level security;

drop policy if exists "anon full access" on public.warehouse_original_backups;
create policy "anon full access" on public.warehouse_original_backups
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon full access" on public.warehouse_original_rows;
create policy "anon full access" on public.warehouse_original_rows
  for all to anon, authenticated using (true) with check (true);
