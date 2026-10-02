-- ============================================================
-- Migration 066: multiple project co-leads
--
-- co_lead_user_id stays as the first co-lead for older readers.
-- co_lead_user_ids is the full list.
-- ============================================================

alter table public.projects
  add column if not exists co_lead_user_ids text[] not null default '{}';

update public.projects
set co_lead_user_ids = (
  select coalesce(array_agg(part), '{}')
  from (
    select trim(value) as part
    from unnest(string_to_array(co_lead_user_id, ',')) as value
    where trim(value) <> ''
  ) parts
)
where co_lead_user_id is not null
  and btrim(co_lead_user_id) <> ''
  and cardinality(co_lead_user_ids) = 0;

update public.projects
set co_lead_user_id = co_lead_user_ids[1]
where cardinality(co_lead_user_ids) > 0
  and co_lead_user_id is distinct from co_lead_user_ids[1];

create index if not exists projects_co_lead_user_ids_idx
  on public.projects using gin (co_lead_user_ids);
