-- ============================================================
-- Seed Gantt: Metlen 8MW (2 × 4MW) project schedule
--
-- Month 1 = December 2026 (through Month 24 = November 2028).
-- Chart workstreams: First 4MW (teal) / Second 4MW (green).
--
-- Targets the live project named "Metlen"
--   id = 140dfb68-fb1b-482c-8ba4-34d6c389028a
-- Falls back to name/client ILIKE '%Metlen%' if that id is missing.
-- Re-runnable: deletes existing gantt rows for that project first.
-- Requires migrations 016–018 (gantt tables).
-- ============================================================

do $$
declare
  v_project_id uuid;
  c_known_id   uuid := '140dfb68-fb1b-482c-8ba4-34d6c389028a';

  -- Phases
  c_phase_common   uuid := '7704f672-6305-4a72-8ce6-9d9ec83023d0';
  c_phase_first    uuid := '2c9b4b74-babe-459c-bfaf-e35244f4da44';
  c_phase_second   uuid := '4fc97d0b-4fa3-4ef8-a358-c7f392baee07';

  -- Colors from chart legend
  c_first  text := '#2A9D8F';
  c_second text := '#A9D08E';
begin
  select id into v_project_id
  from public.projects
  where id = c_known_id;

  if v_project_id is null then
    select id into v_project_id
    from public.projects
    where name ilike '%Metlen%' or client ilike '%Metlen%'
    order by
      case when name = 'Metlen' then 0 else 1 end,
      created_at desc
    limit 1;
  end if;

  if v_project_id is null then
    raise exception 'No Metlen project found (expected id % or name/client ILIKE %%Metlen%%).', c_known_id;
  end if;

  -- Cascade deletes activities + deadlines via phase_id FK
  delete from public.project_gantt_phases where project_id = v_project_id;

  -- ------------------------------------------------------------------
  -- Phases
  -- ------------------------------------------------------------------
  insert into public.project_gantt_phases (
    id, project_id, name, start_date, duration_days, color, sort_order, wbs, owner
  ) values (
    c_phase_common,
    v_project_id,
    'ENGINEERING AND PROCUREMENT',
    '2026-12-01'::date,
    304,
    c_first,
    0,
    '1.0',
    'Hydrogenera / Metlen'
  );

  insert into public.project_gantt_phases (
    id, project_id, name, start_date, duration_days, color, sort_order, wbs, owner
  ) values (
    c_phase_first,
    v_project_id,
    'FIRST 4MW',
    '2027-08-01'::date,
    366,
    c_first,
    1,
    '2.0',
    'Hydrogenera / Metlen'
  );

  insert into public.project_gantt_phases (
    id, project_id, name, start_date, duration_days, color, sort_order, wbs, owner
  ) values (
    c_phase_second,
    v_project_id,
    'SECOND 4MW',
    '2027-12-01'::date,
    366,
    c_second,
    2,
    '3.0',
    'Hydrogenera / Metlen'
  );

  -- ------------------------------------------------------------------
  -- 1.0 Engineering and Procurement (shared)
  -- ------------------------------------------------------------------
  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    'b9e98095-fe04-4016-958a-47c550d620cb'::uuid,
    v_project_id,
    c_phase_common,
    'Order Received',
    '2026-12-01'::date,
    '1.1',
    'Metlen'
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    'a99c854f-8b82-4cff-abe1-4af1bb6c04ef'::uuid,
    v_project_id,
    c_phase_common,
    'Detailed Project Design',
    '2026-12-01'::date,
    121,
    '1.2',
    'Hydrogenera',
    c_first,
    'Planned',
    0
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '438dce7c-76d7-4aa0-b4f8-c7d04a22af19'::uuid,
    v_project_id,
    c_phase_common,
    'Design Complete',
    '2027-03-31'::date,
    '1.3',
    'Hydrogenera / Metlen'
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    'e4a9e962-6de3-4265-be4f-e49260e5028f'::uuid,
    v_project_id,
    c_phase_common,
    'Manufacturing Procurement',
    '2027-04-01'::date,
    183,
    '1.4',
    'Hydrogenera',
    c_first,
    'Planned',
    1
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '7149648f-6031-499c-a4e8-ce1d47735259'::uuid,
    v_project_id,
    c_phase_common,
    'Procurement Complete',
    '2027-09-30'::date,
    '1.5',
    'Hydrogenera'
  );

  -- ------------------------------------------------------------------
  -- 2.0 First 4MW
  -- ------------------------------------------------------------------
  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '7c265fde-6751-4fcf-b151-c062a5de3bf9'::uuid,
    v_project_id,
    c_phase_first,
    'Manufacturing',
    '2027-08-01'::date,
    122,
    '2.1',
    'Hydrogenera',
    c_first,
    'Planned',
    0
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '99f73a27-dc3a-432b-b0f8-971a4a0bf2bf'::uuid,
    v_project_id,
    c_phase_first,
    'Factory Acceptance Test (FAT)',
    '2027-12-01'::date,
    31,
    '2.2',
    'Hydrogenera / Metlen',
    c_first,
    'Planned',
    1
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '03080915-6989-4232-a9b0-0c037f5a4241'::uuid,
    v_project_id,
    c_phase_first,
    'First 4MW FAT Complete',
    '2027-12-31'::date,
    '2.3',
    'Hydrogenera / Metlen'
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '3eac4d0f-f171-42ed-a880-14ba36ea35d9'::uuid,
    v_project_id,
    c_phase_first,
    'Site Preparation',
    '2028-01-01'::date,
    31,
    '2.4',
    'Metlen',
    c_first,
    'Planned',
    2
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '63f99507-39fc-40dd-a7c9-60afc25dbb9a'::uuid,
    v_project_id,
    c_phase_first,
    'Packing and Shipping to Site',
    '2028-02-01'::date,
    29,
    '2.5',
    'Hydrogenera',
    c_first,
    'Planned',
    3
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    'ea43806e-8a32-48e7-9881-90be8240f588'::uuid,
    v_project_id,
    c_phase_first,
    'Installation',
    '2028-03-01'::date,
    31,
    '2.6',
    'Hydrogenera / Metlen',
    c_first,
    'Planned',
    4
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '5eab75dc-d2d1-4d5a-8255-3970f8e415d9'::uuid,
    v_project_id,
    c_phase_first,
    'Commissioning',
    '2028-04-01'::date,
    30,
    '2.7',
    'Hydrogenera',
    c_first,
    'Planned',
    5
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '62aa5652-f1e4-43f2-b9ca-4017b5e9b6fe'::uuid,
    v_project_id,
    c_phase_first,
    'Site Acceptance Test (SAT)',
    '2028-05-01'::date,
    61,
    '2.8',
    'Hydrogenera / Metlen',
    c_first,
    'Planned',
    6
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    'e653e39d-1365-4e4d-acb5-54c0b8d54af8'::uuid,
    v_project_id,
    c_phase_first,
    'Handover to Customer',
    '2028-06-01'::date,
    61,
    '2.9',
    'Hydrogenera / Metlen',
    c_first,
    'Planned',
    7
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '31d24a73-27d8-43a5-81f3-76e5877d8bc6'::uuid,
    v_project_id,
    c_phase_first,
    'First 4MW Handover Complete',
    '2028-07-31'::date,
    '2.10',
    'Hydrogenera / Metlen'
  );

  -- ------------------------------------------------------------------
  -- 3.0 Second 4MW
  -- ------------------------------------------------------------------
  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '6e734987-7314-4be3-af72-6e26178a38a2'::uuid,
    v_project_id,
    c_phase_second,
    'Manufacturing',
    '2027-12-01'::date,
    122,
    '3.1',
    'Hydrogenera',
    c_second,
    'Planned',
    0
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    'c0ee8294-0dc5-4536-9fa7-28a64dc2de86'::uuid,
    v_project_id,
    c_phase_second,
    'Factory Acceptance Test (FAT)',
    '2028-04-01'::date,
    30,
    '3.2',
    'Hydrogenera / Metlen',
    c_second,
    'Planned',
    1
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    'efced869-796b-46fa-aab0-4cde491758a7'::uuid,
    v_project_id,
    c_phase_second,
    'Second 4MW FAT Complete',
    '2028-04-30'::date,
    '3.3',
    'Hydrogenera / Metlen'
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    'e5714e2e-9608-4cf9-8983-1ae3213d019e'::uuid,
    v_project_id,
    c_phase_second,
    'Site Preparation',
    '2028-05-01'::date,
    31,
    '3.4',
    'Metlen',
    c_second,
    'Planned',
    2
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '50e7e5e9-e202-4835-8a19-c66d8225156e'::uuid,
    v_project_id,
    c_phase_second,
    'Packing and Shipping to Site',
    '2028-06-01'::date,
    30,
    '3.5',
    'Hydrogenera',
    c_second,
    'Planned',
    3
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '811765dd-59f3-47d6-ac50-e3514a07cf2a'::uuid,
    v_project_id,
    c_phase_second,
    'Installation',
    '2028-07-01'::date,
    31,
    '3.6',
    'Hydrogenera / Metlen',
    c_second,
    'Planned',
    4
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '49fc4843-56b3-4711-b1a2-6df262ccf686'::uuid,
    v_project_id,
    c_phase_second,
    'Commissioning',
    '2028-08-01'::date,
    31,
    '3.7',
    'Hydrogenera',
    c_second,
    'Planned',
    5
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '01995a81-a5b7-4c11-9666-24a8b706c1fa'::uuid,
    v_project_id,
    c_phase_second,
    'Site Acceptance Test (SAT)',
    '2028-09-01'::date,
    61,
    '3.8',
    'Hydrogenera / Metlen',
    c_second,
    'Planned',
    6
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    'f58b36a4-d952-4886-ae94-f1d001fe4692'::uuid,
    v_project_id,
    c_phase_second,
    'Handover to Customer',
    '2028-10-01'::date,
    61,
    '3.9',
    'Hydrogenera / Metlen',
    c_second,
    'Planned',
    7
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    'a0ed2b1c-ef92-4c53-ae52-d700437dc7f2'::uuid,
    v_project_id,
    c_phase_second,
    'Second 4MW Handover Complete / Project Complete',
    '2028-11-30'::date,
    '3.10',
    'Hydrogenera / Metlen'
  );

  raise notice
    'Gantt seeded for Metlen project %: 3 phases, 18 activities, 7 milestones (Month 1 = Dec 2026)',
    v_project_id;
end $$;
