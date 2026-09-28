-- ============================================================
-- Migration 061: Warm Lead sales stage
-- Inserts warm-lead between cold-lead and hot-lead on the board,
-- with pipeline timestamp + metrics stale threshold.
-- ============================================================

-- Expand projects.stage check
alter table public.projects
  drop constraint if exists projects_stage_check;

alter table public.projects
  add constraint projects_stage_check
  check (
    stage in (
      'cold-lead',
      'warm-lead',
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

-- Expand project_comments.stage_change check
alter table public.project_comments
  drop constraint if exists project_comments_stage_change_check;

alter table public.project_comments
  add constraint project_comments_stage_change_check
  check (
    stage_change is null
    or stage_change in (
      'cold-lead',
      'warm-lead',
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

alter table public.projects
  add column if not exists warm_lead_entered_at timestamptz;

comment on column public.projects.warm_lead_entered_at is
  'First time the project entered Warm Lead (yyyy-mm-dd metrics timestamp).';

alter table public.company_metrics_settings
  add column if not exists stale_warm_days integer not null default 150;

comment on column public.company_metrics_settings.stale_warm_days is
  'Days without meaningful activity before a Warm Lead is marked stale.';

comment on constraint projects_stage_check on public.projects is
  'Sales: cold/warm/hot-lead, under-development, commissioned, cancelled; plus EU/RnD stages.';
