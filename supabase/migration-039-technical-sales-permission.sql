-- ============================================================
-- Migration 039: add technical_sales permission type
-- Additive — expands the check constraint only.
-- ============================================================

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
      'technical_sales'
    )
  );
