-- ============================================================
-- Migration 007: project file attachments (offers, models, …)
-- Purely additive — does NOT delete existing project data.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ---------- Metadata table ----------

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes >= 0),
  kind text not null default 'other'
    check (kind in ('offer', 'financial-model', 'other')),
  note text,
  storage_path text not null,
  uploaded_by_user_id text,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists project_files_project_created_idx
  on public.project_files (project_id, created_at desc);

alter table public.project_files enable row level security;

drop policy if exists "anon full access" on public.project_files;
create policy "anon full access"
  on public.project_files
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ---------- Storage bucket ----------
-- Private bucket; app uses signed URLs for download.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  false,
  26214400, -- 25 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/csv',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      public = excluded.public;

-- Storage policies: anon/authenticated can manage objects in this bucket
-- (matches the app's current anon-key data access model).

drop policy if exists "project files read" on storage.objects;
create policy "project files read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'project-files');

drop policy if exists "project files insert" on storage.objects;
create policy "project files insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'project-files');

drop policy if exists "project files update" on storage.objects;
create policy "project files update"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'project-files')
  with check (bucket_id = 'project-files');

drop policy if exists "project files delete" on storage.objects;
create policy "project files delete"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'project-files');
