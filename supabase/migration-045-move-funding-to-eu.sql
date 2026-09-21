-- ============================================================
-- Migration 045: move Funding-market projects → EU track
-- Prerequisites: migration-044-eu-rnd-track.sql must be applied.
--
-- Moves every non-holding project whose market includes the
-- "Funding" tag onto EU Projects at Application Preparation.
-- Market may be "Funding" alone or combined (e.g. "Funding + Clean H2").
-- ============================================================

-- Preview (run first if you want to inspect):
-- select id, name, client, market, stage, project_track
-- from public.projects
-- where coalesce(is_warehouse_holding, false) = false
--   and (
--     market = 'Funding'
--     or market like 'Funding + %'
--     or market like '% + Funding'
--     or market like '% + Funding + %'
--   )
-- order by name;

update public.projects
set
  project_track = 'eu',
  stage = 'eu-application-prep'
where coalesce(is_warehouse_holding, false) = false
  and (
    market = 'Funding'
    or market like 'Funding + %'
    or market like '% + Funding'
    or market like '% + Funding + %'
  );

-- Optional: confirm counts after
-- select project_track, stage, count(*)
-- from public.projects
-- where project_track = 'eu'
-- group by 1, 2
-- order by 1, 2;
