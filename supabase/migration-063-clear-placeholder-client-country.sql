-- ============================================================
-- Migration 063: clear "..." placeholders for optional client/country
-- Client and country are no longer required on project creation.
-- ============================================================

update public.projects
set client = ''
where trim(client) = '...';

update public.projects
set country = ''
where trim(country) = '...';
