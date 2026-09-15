-- ============================================================
-- Migration 038 (fixed): remap legacy team member ids
--
-- Fix vs previous version: usernames are unique, so we temporarily
-- rename old usernames before inserting the new-id rows.
--
-- Mapping:
--   u-andrew → u-e-kostova
--   u-daniel → u-test-sales
--   u-irina  → u-i-mihaylov
--   u-maria  → u-b-angelov
--   u-admin  unchanged
--
-- Safe to re-run if the previous attempt failed mid-way.
-- ============================================================

create temporary table if not exists _id_map (
  old_id text primary key,
  new_id text not null unique
);

truncate _id_map;

insert into _id_map (old_id, new_id) values
  ('u-andrew', 'u-e-kostova'),
  ('u-daniel', 'u-test-sales'),
  ('u-irina',  'u-i-mihaylov'),
  ('u-maria',  'u-b-angelov');

-- If a previous run already created some new ids, skip those old→new pairs
-- where new already exists and old is gone.
delete from _id_map m
where exists (select 1 from public.team_members t where t.id = m.new_id)
  and not exists (select 1 from public.team_members t where t.id = m.old_id);

-- 0) Free unique usernames on rows we are about to replace
update public.team_members t
set
  username = t.username || '__old_' || t.id,
  updated_at = now()
from _id_map m
where t.id = m.old_id
  and t.username is not null
  and t.username not like '%__old_%';

-- 1) Insert new-id copies (now usernames are free)
insert into public.team_members (
  id, name, email, created_at,
  username, password_hash, is_admin, is_active,
  must_change_password, updated_at
)
select
  m.new_id,
  t.name,
  t.email,
  t.created_at,
  -- restore real username (strip temporary suffix)
  regexp_replace(t.username, '__old_.*$', ''),
  t.password_hash,
  t.is_admin,
  t.is_active,
  t.must_change_password,
  now()
from public.team_members t
join _id_map m on m.old_id = t.id
where not exists (
  select 1 from public.team_members x where x.id = m.new_id
);

-- 2) Move permission rows
insert into public.user_permission_types (user_id, permission_type, created_at)
select m.new_id, p.permission_type, p.created_at
from public.user_permission_types p
join _id_map m on m.old_id = p.user_id
on conflict do nothing;

delete from public.user_permission_types p
using _id_map m
where p.user_id = m.old_id;

-- 3) Rewrite soft references
update public.projects p
set lead_user_id = m.new_id
from _id_map m
where p.lead_user_id = m.old_id;

update public.project_comments c
set author_user_id = m.new_id
from _id_map m
where c.author_user_id = m.old_id;

update public.project_todos t
set owner_user_id = m.new_id
from _id_map m
where t.owner_user_id = m.old_id;

update public.personal_todos t
set owner_user_id = m.new_id
from _id_map m
where t.owner_user_id = m.old_id;

update public.personal_todo_comments c
set author_user_id = m.new_id
from _id_map m
where c.author_user_id = m.old_id;

update public.project_files f
set uploaded_by_user_id = m.new_id
from _id_map m
where f.uploaded_by_user_id = m.old_id;

do $$
begin
  if to_regclass('public.app_change_events') is not null then
    update public.app_change_events e
    set actor_user_id = m.new_id
    from _id_map m
    where e.actor_user_id = m.old_id;
  end if;

  if to_regclass('public.prospect_companies') is not null then
    update public.prospect_companies c
    set owner_id = m.new_id
    from _id_map m
    where c.owner_id = m.old_id;
  end if;

  if to_regclass('public.prospect_contacts') is not null then
    update public.prospect_contacts c
    set owner_id = m.new_id
    from _id_map m
    where c.owner_id = m.old_id;
  end if;

  if to_regclass('public.prospect_activities') is not null then
    update public.prospect_activities a
    set user_id = m.new_id
    from _id_map m
    where a.user_id = m.old_id;
  end if;
end $$;

-- 4) Remove old id rows
delete from public.team_members t
using _id_map m
where t.id = m.old_id;

-- 5) Verify
select id, name, username, is_admin, is_active
from public.team_members
order by name;

select lead_user_id, count(*) as projects
from public.projects
group by lead_user_id
order by projects desc;
