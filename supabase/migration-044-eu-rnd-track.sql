-- ============================================================
-- Migration 044: EU Projects & RnD track + permission
-- Additive — expands checks and adds project_track (default sales).
-- ============================================================

-- ---------- Permission: EU Funding and R&D ----------
alter table public.user_permission_types
  drop constraint if exists user_permission_types_permission_type_check;

alter table public.user_permission_types
  add constraint user_permission_types_permission_type_check
  check (
    permission_type in (
      'sales',
      'finance',
      'warehouse',
      'production',
      'technical_sales',
      'eu_funding_rnd'
    )
  );

-- ---------- Project track (sales | eu | rnd) ----------
alter table public.projects
  add column if not exists project_track text not null default 'sales';

alter table public.projects
  drop constraint if exists projects_project_track_check;

alter table public.projects
  add constraint projects_project_track_check
  check (project_track in ('sales', 'eu', 'rnd'));

create index if not exists projects_project_track_idx
  on public.projects (project_track);

-- ---------- Expand stage check (sales + EU + RnD) ----------
alter table public.projects
  drop constraint if exists projects_stage_check;

alter table public.projects
  add constraint projects_stage_check
  check (
    stage in (
      'cold-lead',
      'hot-lead',
      'under-development',
      'commissioned',
      'cancelled',
      'eu-application-prep',
      'eu-application-submitted',
      'eu-project-started',
      'rnd-execution'
    )
  );

-- Comment stage_change must allow the same stage ids
alter table public.project_comments
  drop constraint if exists project_comments_stage_change_check;

alter table public.project_comments
  add constraint project_comments_stage_change_check
  check (
    stage_change is null
    or stage_change in (
      'cold-lead',
      'hot-lead',
      'under-development',
      'commissioned',
      'cancelled',
      'eu-application-prep',
      'eu-application-submitted',
      'eu-project-started',
      'rnd-execution'
    )
  );
