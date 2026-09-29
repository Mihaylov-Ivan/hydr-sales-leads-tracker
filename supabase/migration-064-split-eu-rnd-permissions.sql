-- ============================================================
-- Migration 064: split EU Funding and RnD permissions
-- Replaces eu_funding_rnd with separate eu_funding and rnd.
-- Users who had the combined permission get both new ones.
-- ============================================================

alter table public.user_permission_types
  drop constraint if exists user_permission_types_permission_type_check;

-- Allow both legacy and new values during the remap.
alter table public.user_permission_types
  add constraint user_permission_types_permission_type_check
  check (
    permission_type in (
      'sales',
      'finance',
      'warehouse',
      'production',
      'technical_sales',
      'eu_funding_rnd',
      'eu_funding',
      'rnd',
      'sales_manager',
      'ai_updates',
      'briefings',
      'viewer'
    )
  );

-- Grant both new permissions to anyone who had the combined one.
insert into public.user_permission_types (user_id, permission_type)
select user_id, 'eu_funding'
from public.user_permission_types
where permission_type = 'eu_funding_rnd'
on conflict do nothing;

insert into public.user_permission_types (user_id, permission_type)
select user_id, 'rnd'
from public.user_permission_types
where permission_type = 'eu_funding_rnd'
on conflict do nothing;

delete from public.user_permission_types
where permission_type = 'eu_funding_rnd';

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
      'eu_funding',
      'rnd',
      'sales_manager',
      'ai_updates',
      'briefings',
      'viewer'
    )
  );
