-- ============================================================
-- Seed Gantt: Ceramika PARADYŻ from Jersey
--
-- Simple schedule derived from finance payment milestones:
--   Prepayment          2026-09-01  → contract signing
--   Design approval     2026-10-01
--   Engineering complete 2026-10-01
--   FAT                 2027-03-01
--   SAT                 2027-04-01
--   FAC                 2027-05-01  → contract end
--
-- Project id: b2fd32ac-9d24-4ac4-8092-a5a106618c96
-- Re-runnable. Requires migrations 016–018.
-- ============================================================

do $$
declare
  v_project_id uuid := 'b2fd32ac-9d24-4ac4-8092-a5a106618c96';

  c_phase_init uuid := '37d9802e-8872-495f-b2a6-ff1e89542534';
  c_phase_eng  uuid := '1a1aab08-5156-440e-b9ba-96d3faf71bb6';
  c_phase_mfg  uuid := '654f7f97-c3d4-46dd-92d4-d5835da4d6dd';
  c_phase_site uuid := 'cb33f993-8029-4edf-838d-7cf686502ec8';

  c_bar text := '#5B9BD5';
begin
  if not exists (select 1 from public.projects where id = v_project_id) then
    raise exception 'Ceramika project % not found.', v_project_id;
  end if;

  delete from public.project_gantt_phases where project_id = v_project_id;

  -- ------------------------------------------------------------------
  -- Phases
  -- ------------------------------------------------------------------
  insert into public.project_gantt_phases (
    id, project_id, name, start_date, duration_days, color, sort_order, wbs, owner
  ) values
    (c_phase_init, v_project_id, 'PROJECT INITIATION',
     '2026-09-01'::date, 1, c_bar, 0, '1.0', 'Hydrogenera / Ceramika PARADYŻ'),
    (c_phase_eng, v_project_id, 'ENGINEERING AND DESIGN',
     '2026-09-01'::date, 31, c_bar, 1, '2.0', 'Hydrogenera'),
    (c_phase_mfg, v_project_id, 'PROCUREMENT, MANUFACTURING AND FAT',
     '2026-10-01'::date, 152, c_bar, 2, '3.0', 'Hydrogenera'),
    (c_phase_site, v_project_id, 'INSTALLATION, SAT AND HANDOVER',
     '2027-03-01'::date, 62, c_bar, 3, '4.0', 'Hydrogenera / Ceramika PARADYŻ');

  -- ------------------------------------------------------------------
  -- 1.0 Project initiation
  -- ------------------------------------------------------------------
  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    'c8976971-9ef2-4729-b433-61037833ad99'::uuid,
    v_project_id, c_phase_init,
    'Contract Signed / Prepayment',
    '2026-09-01'::date, '1.1', 'Ceramika PARADYŻ'
  );

  -- ------------------------------------------------------------------
  -- 2.0 Engineering and design
  -- ------------------------------------------------------------------
  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values
    ('97eae0ad-aeec-45af-b9b8-56f84e80c3c6'::uuid,
     v_project_id, c_phase_eng,
     'Detailed Design',
     '2026-09-01'::date, 31, '2.1', 'Hydrogenera', c_bar, 'Planned', 0),
    ('153bb341-19c8-4228-952d-d16e56abc046'::uuid,
     v_project_id, c_phase_eng,
     'Detailed Engineering',
     '2026-09-15'::date, 17, '2.2', 'Hydrogenera', c_bar, 'Planned', 1);

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values
    ('2ff98b0a-e8f6-40be-88f2-4e55fc2b4d11'::uuid,
     v_project_id, c_phase_eng,
     'Design Approval',
     '2026-10-01'::date, '2.3', 'Hydrogenera / Ceramika PARADYŻ'),
    ('5b0f2026-0473-4010-bb57-d077d1ea27ff'::uuid,
     v_project_id, c_phase_eng,
     'Engineering Complete',
     '2026-10-01'::date, '2.4', 'Hydrogenera');

  -- ------------------------------------------------------------------
  -- 3.0 Procurement, manufacturing and FAT
  -- ------------------------------------------------------------------
  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values
    ('160923b4-17d3-49cc-bca8-9efc21c9408e'::uuid,
     v_project_id, c_phase_mfg,
     'Procurement',
     '2026-10-01'::date, 76, '3.1', 'Hydrogenera', c_bar, 'Planned', 0),
    ('97cdffda-d810-4b8f-bdb1-2695def86235'::uuid,
     v_project_id, c_phase_mfg,
     'Manufacturing',
     '2026-11-01'::date, 112, '3.2', 'Hydrogenera', c_bar, 'Planned', 1),
    ('0cef60b0-84c1-4276-be02-c7920bf1fddf'::uuid,
     v_project_id, c_phase_mfg,
     'Factory Acceptance Test (FAT)',
     '2027-02-15'::date, 15, '3.3', 'Hydrogenera / Ceramika PARADYŻ', c_bar, 'Planned', 2);

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '4f384ce9-4fb2-46eb-98c0-18e166332291'::uuid,
    v_project_id, c_phase_mfg,
    'FAT Complete',
    '2027-03-01'::date, '3.4', 'Hydrogenera / Ceramika PARADYŻ'
  );

  -- ------------------------------------------------------------------
  -- 4.0 Installation, SAT and handover
  -- ------------------------------------------------------------------
  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values
    ('62443344-bcfd-4294-9255-8848b682fe57'::uuid,
     v_project_id, c_phase_site,
     'Packing, Shipping and Site Preparation',
     '2027-03-01'::date, 20, '4.1', 'Hydrogenera', c_bar, 'Planned', 0),
    ('903bc962-59fa-4b67-bc87-b8c4fa4ed1e5'::uuid,
     v_project_id, c_phase_site,
     'Installation',
     '2027-03-15'::date, 14, '4.2', 'Hydrogenera / Ceramika PARADYŻ', c_bar, 'Planned', 1),
    ('98e689b1-896f-47eb-bbe2-17fe10347f8a'::uuid,
     v_project_id, c_phase_site,
     'Commissioning and Site Acceptance Test (SAT)',
     '2027-03-25'::date, 8, '4.3', 'Hydrogenera / Ceramika PARADYŻ', c_bar, 'Planned', 2),
    ('f0df7fe8-a610-4a1b-8aa8-37352a56f7fa'::uuid,
     v_project_id, c_phase_site,
     'Handover and Punch-list Close-out',
     '2027-04-01'::date, 31, '4.4', 'Hydrogenera / Ceramika PARADYŻ', c_bar, 'Planned', 3);

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values
    ('9d13b99e-257f-4c6c-a7ad-8b3cd706e6b0'::uuid,
     v_project_id, c_phase_site,
     'SAT Complete',
     '2027-04-01'::date, '4.5', 'Hydrogenera / Ceramika PARADYŻ'),
    ('0637c335-54e9-4be8-825f-a6d3820e0172'::uuid,
     v_project_id, c_phase_site,
     'FAC / Contract Complete',
     '2027-05-01'::date, '4.6', 'Hydrogenera / Ceramika PARADYŻ');

  raise notice
    'Gantt seeded for Ceramika project %: 4 phases, 9 activities, 6 milestones',
    v_project_id;
end $$;
