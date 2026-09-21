-- Optional system size (kW) on prospect companies.
-- Additive only; existing rows stay null/0.

alter table public.prospect_companies
  add column if not exists size_kw numeric;
