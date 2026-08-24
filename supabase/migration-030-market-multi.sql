-- ============================================================
-- migration-030: allow multiple markets per project
-- Additive: drop enum check so combinations like "Cement + Clean H2"
-- can be stored as text. Existing single-value rows stay valid.
-- ============================================================

alter table public.projects
  drop constraint if exists projects_market_check;

comment on column public.projects.market is
  'Markets joined with " + " (Cement, Power Plants, Funding, Clean H2, Burner Optimisation, Tenders)';
