-- ============================================================
-- Seed Gantt from templates/projects/gantt.xlsx
-- FBK 250 kW Electrolysis System → FBK project
--
-- Looks up project by name ILIKE '%FBK%'.
-- Edit the WHERE clause if your project name differs.
-- Re-runnable: deletes existing gantt rows for that project first.
-- Requires migrations 016–018 (gantt tables).
-- ============================================================

do $$
declare
  v_project_id uuid;
begin
  select id into v_project_id
  from public.projects
  where name ilike '%FBK%'
  order by created_at
  limit 1;

  if v_project_id is null then
    raise exception 'No project matching name ILIKE %%FBK%% found. Rename or edit this script.';
  end if;

  -- Cascade deletes activities + deadlines via phase_id FK
  delete from public.project_gantt_phases where project_id = v_project_id;

  insert into public.project_gantt_phases (
    id, project_id, name, start_date, duration_days, color, sort_order, wbs, owner
  ) values (
    '5f20beff-0eee-4322-8ac6-6de0ed12e35a'::uuid,
    v_project_id,
    'PROJECT INITIATION',
    '2026-02-01'::date,
    34,
    '#5B9BD5',
    0,
    '1.0',
    'Hydrogenera / FBK'
  );

  insert into public.project_gantt_phases (
    id, project_id, name, start_date, duration_days, color, sort_order, wbs, owner
  ) values (
    'c65cbce4-9920-4f68-81b7-44f2aa459f3c'::uuid,
    v_project_id,
    'ENGINEERING AND DESIGN',
    '2026-03-02'::date,
    334,
    '#5B9BD5',
    1,
    '2.0',
    'Hydrogenera'
  );

  insert into public.project_gantt_phases (
    id, project_id, name, start_date, duration_days, color, sort_order, wbs, owner
  ) values (
    '4bb20eb7-ee98-4534-9b8b-0b83cbed68da'::uuid,
    v_project_id,
    'PROCUREMENT',
    '2026-07-01'::date,
    365,
    '#5B9BD5',
    2,
    '3.0',
    'Hydrogenera'
  );

  insert into public.project_gantt_phases (
    id, project_id, name, start_date, duration_days, color, sort_order, wbs, owner
  ) values (
    'bff9f393-c334-48b0-98d2-9fcce0220490'::uuid,
    v_project_id,
    'MANUFACTURING AND INTEGRATION',
    '2027-03-01'::date,
    201,
    '#5B9BD5',
    3,
    '4.0',
    'Hydrogenera'
  );

  insert into public.project_gantt_phases (
    id, project_id, name, start_date, duration_days, color, sort_order, wbs, owner
  ) values (
    '0fce11f4-c59c-4d8a-917c-492748590534'::uuid,
    v_project_id,
    'TESTING AND FAT',
    '2027-09-20'::date,
    19,
    '#5B9BD5',
    4,
    '5.0',
    'Hydrogenera / FBK'
  );

  insert into public.project_gantt_phases (
    id, project_id, name, start_date, duration_days, color, sort_order, wbs, owner
  ) values (
    '6c043b2a-7558-4262-93da-7cedc77f972d'::uuid,
    v_project_id,
    'SITE PREPARATION - CLIENT SCOPE',
    '2027-05-03'::date,
    173,
    '#ED7D31',
    5,
    '6.0',
    'FBK'
  );

  insert into public.project_gantt_phases (
    id, project_id, name, start_date, duration_days, color, sort_order, wbs, owner
  ) values (
    '8760b642-8bd1-4161-9b86-eb1877721e8b'::uuid,
    v_project_id,
    'LOGISTICS, INSTALLATION AND COMMISSIONING',
    '2027-10-11'::date,
    43,
    '#5B9BD5',
    6,
    '7.0',
    'Hydrogenera / FBK'
  );

  insert into public.project_gantt_phases (
    id, project_id, name, start_date, duration_days, color, sort_order, wbs, owner
  ) values (
    '4981f7b9-d988-4392-bbcc-2748bde1d26a'::uuid,
    v_project_id,
    'CONTRACTUAL BUFFER',
    '2027-11-23'::date,
    8,
    '#5B9BD5',
    7,
    '8.0',
    'Hydrogenera / FBK'
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    'e30352de-fb84-4f14-9faa-96f945514280'::uuid,
    v_project_id,
    '5f20beff-0eee-4322-8ac6-6de0ed12e35a'::uuid,
    'Contract Award and Down Payment Received',
    '2026-02-02'::date,
    '1.1',
    'FBK'
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '4a686d1c-0e67-4ec3-9f1d-530703d852e8'::uuid,
    v_project_id,
    '5f20beff-0eee-4322-8ac6-6de0ed12e35a'::uuid,
    'Project Kick-off Meeting',
    '2026-02-09'::date,
    '1.2',
    'Hydrogenera / FBK'
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '7b18f535-79bb-486e-adc0-cad6debb2334'::uuid,
    v_project_id,
    '5f20beff-0eee-4322-8ac6-6de0ed12e35a'::uuid,
    'Confirmation of Technical Requirements and Interfaces',
    '2026-02-09'::date,
    26,
    '1.3',
    'Hydrogenera / FBK',
    '#5B9BD5',
    'Planned',
    0
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    'bc6b26a8-c0d2-46ec-8b72-d5a7e21a32fd'::uuid,
    v_project_id,
    'c65cbce4-9920-4f68-81b7-44f2aa459f3c'::uuid,
    'Basic Engineering',
    '2026-03-02'::date,
    89,
    '2.1',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    0
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '0800dd63-692e-4712-8e33-ce40f025dcaf'::uuid,
    v_project_id,
    'c65cbce4-9920-4f68-81b7-44f2aa459f3c'::uuid,
    'Detailed Mechanical Engineering',
    '2026-05-04'::date,
    208,
    '2.2',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    1
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    'ffbe0831-e253-4313-b8fc-d11ae45697b0'::uuid,
    v_project_id,
    'c65cbce4-9920-4f68-81b7-44f2aa459f3c'::uuid,
    'Electrical and Automation Engineering',
    '2026-06-01'::date,
    201,
    '2.3',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    2
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '457eb292-484c-47a9-a84d-d55e5fb1894f'::uuid,
    v_project_id,
    'c65cbce4-9920-4f68-81b7-44f2aa459f3c'::uuid,
    'Safety Review / Risk Assessment',
    '2026-09-01'::date,
    91,
    '2.4',
    'Hydrogenera / FBK',
    '#5B9BD5',
    'Planned',
    3
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '3c04bf89-c562-4e35-aeb8-23f9e720130e'::uuid,
    v_project_id,
    'c65cbce4-9920-4f68-81b7-44f2aa459f3c'::uuid,
    'Design Documentation Submission',
    '2026-11-30'::date,
    '2.5',
    'Hydrogenera'
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '9e9a7a3a-8a7e-4590-a2a7-b2bcb4282787'::uuid,
    v_project_id,
    'c65cbce4-9920-4f68-81b7-44f2aa459f3c'::uuid,
    'FBK Design Review and Approval',
    '2026-12-01'::date,
    60,
    '2.6',
    'FBK',
    '#70AD47',
    'Planned',
    4
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '4d440b83-2f4b-46a7-89a6-29cf807be8c6'::uuid,
    v_project_id,
    'c65cbce4-9920-4f68-81b7-44f2aa459f3c'::uuid,
    'Design Freeze',
    '2027-01-29'::date,
    '2.7',
    'Hydrogenera / FBK'
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '10df8a02-6214-4846-a19a-3e99482f3839'::uuid,
    v_project_id,
    '4bb20eb7-ee98-4534-9b8b-0b83cbed68da'::uuid,
    'Long-lead Item Procurement',
    '2026-07-01'::date,
    365,
    '3.1',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    0
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '840bae26-326c-4b2a-9338-c1ddc48e176c'::uuid,
    v_project_id,
    '4bb20eb7-ee98-4534-9b8b-0b83cbed68da'::uuid,
    'General Procurement',
    '2027-01-04'::date,
    178,
    '3.2',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    1
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    'b461a7a6-83b2-475c-9722-33447cb51ec0'::uuid,
    v_project_id,
    '4bb20eb7-ee98-4534-9b8b-0b83cbed68da'::uuid,
    'Procurement Complete',
    '2027-06-30'::date,
    '3.3',
    'Hydrogenera'
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '0557d394-2b2b-4228-88a0-beded58de484'::uuid,
    v_project_id,
    'bff9f393-c334-48b0-98d2-9fcce0220490'::uuid,
    'Electrolyser Stack Manufacturing',
    '2027-03-01'::date,
    152,
    '4.1',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    0
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '32d0cb45-49c4-4ef0-9616-e1e7dc2248ea'::uuid,
    v_project_id,
    'bff9f393-c334-48b0-98d2-9fcce0220490'::uuid,
    'Balance of Plant Manufacturing',
    '2027-04-01'::date,
    153,
    '4.2',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    1
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '3d024fc0-9ee4-4159-9ff2-413198dc689e'::uuid,
    v_project_id,
    'bff9f393-c334-48b0-98d2-9fcce0220490'::uuid,
    'Electrical Cabinet and PLC Integration',
    '2027-05-03'::date,
    121,
    '4.3',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    2
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '1808fc2c-3e4d-4aa7-8d66-96d948eb246c'::uuid,
    v_project_id,
    'bff9f393-c334-48b0-98d2-9fcce0220490'::uuid,
    'Mechanical Assembly and System Integration',
    '2027-07-01'::date,
    79,
    '4.4',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    3
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '2ff9d759-6e1d-40ac-9462-b1e7a6f7f815'::uuid,
    v_project_id,
    'bff9f393-c334-48b0-98d2-9fcce0220490'::uuid,
    'Manufacturing Complete',
    '2027-09-17'::date,
    '4.5',
    'Hydrogenera'
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '5605fcfb-fca7-49cc-8652-f7a5762b8e8b'::uuid,
    v_project_id,
    '0fce11f4-c59c-4d8a-917c-492748590534'::uuid,
    'Internal Testing and Pre-commissioning',
    '2027-09-20'::date,
    11,
    '5.1',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    0
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '0b950d6a-8736-4753-9ca6-7afb40b022e0'::uuid,
    v_project_id,
    '0fce11f4-c59c-4d8a-917c-492748590534'::uuid,
    'FAT Documentation Submission',
    '2027-09-24'::date,
    '5.2',
    'Hydrogenera'
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    'b37f49c3-343a-4d73-bfde-c469f21e7462'::uuid,
    v_project_id,
    '0fce11f4-c59c-4d8a-917c-492748590534'::uuid,
    'Factory Acceptance Test (FAT)',
    '2027-10-01'::date,
    '5.3',
    'Hydrogenera / FBK'
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '6a57ab2c-84ac-4355-9a50-5c0aae174ac0'::uuid,
    v_project_id,
    '0fce11f4-c59c-4d8a-917c-492748590534'::uuid,
    'FAT Punch-list Resolution',
    '2027-10-04'::date,
    5,
    '5.4',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    1
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    'cd8057e2-00c0-4756-be29-996408c41371'::uuid,
    v_project_id,
    '6c043b2a-7558-4262-93da-7cedc77f972d'::uuid,
    'Civil Works, Foundations and Equipment Access',
    '2027-05-03'::date,
    151,
    '6.1',
    'FBK',
    '#5B9BD5',
    'Planned',
    0
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    'e1ab02ea-4522-46f8-a5e0-333d44ee2b0b'::uuid,
    v_project_id,
    '6c043b2a-7558-4262-93da-7cedc77f972d'::uuid,
    'Utilities and Interface Connections Prepared',
    '2027-07-01'::date,
    107,
    '6.2',
    'FBK',
    '#5B9BD5',
    'Planned',
    1
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '3ee2fa92-c667-451d-929e-441ddd9cf253'::uuid,
    v_project_id,
    '6c043b2a-7558-4262-93da-7cedc77f972d'::uuid,
    'Permits and Site Safety Requirements',
    '2027-07-01'::date,
    107,
    '6.3',
    'FBK',
    '#5B9BD5',
    'Planned',
    2
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    'aa1580c1-0a8e-49c8-acaa-5aa33fc8c657'::uuid,
    v_project_id,
    '6c043b2a-7558-4262-93da-7cedc77f972d'::uuid,
    'Site Readiness Confirmation',
    '2027-10-22'::date,
    '6.4',
    'FBK'
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '9ae362fc-079c-4ef0-9010-ee890bed04a3'::uuid,
    v_project_id,
    '8760b642-8bd1-4161-9b86-eb1877721e8b'::uuid,
    'Packing and Preparation for Shipment',
    '2027-10-11'::date,
    12,
    '7.1',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    0
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    'f3c470f3-1b4b-40c3-981f-5b914b2fb377'::uuid,
    v_project_id,
    '8760b642-8bd1-4161-9b86-eb1877721e8b'::uuid,
    'Shipment to Trento, Italy',
    '2027-10-25'::date,
    5,
    '7.2',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    1
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '37eb824d-a8e4-4e3f-9577-6699fe8c4406'::uuid,
    v_project_id,
    '8760b642-8bd1-4161-9b86-eb1877721e8b'::uuid,
    'Mechanical Installation',
    '2027-10-30'::date,
    7,
    '7.3',
    'Hydrogenera / FBK',
    '#5B9BD5',
    'Planned',
    2
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    'dcf547d9-80b7-416d-b9be-d900f6b7fc87'::uuid,
    v_project_id,
    '8760b642-8bd1-4161-9b86-eb1877721e8b'::uuid,
    'Electrical and Utility Connections',
    '2027-11-02'::date,
    9,
    '7.4',
    'Hydrogenera / FBK',
    '#5B9BD5',
    'Planned',
    3
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '17765519-5a1b-439a-a58f-9b113db88130'::uuid,
    v_project_id,
    '8760b642-8bd1-4161-9b86-eb1877721e8b'::uuid,
    'Cold Commissioning',
    '2027-11-08'::date,
    3,
    '7.5',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    4
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    'ac3f786b-fe09-496e-b62c-58bf32f524ce'::uuid,
    v_project_id,
    '8760b642-8bd1-4161-9b86-eb1877721e8b'::uuid,
    'Hot Commissioning and Start-up',
    '2027-11-10'::date,
    6,
    '7.6',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    5
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '0dca4387-ae6d-48b1-8228-b6b0dbc9153e'::uuid,
    v_project_id,
    '8760b642-8bd1-4161-9b86-eb1877721e8b'::uuid,
    'First Hydrogen',
    '2027-11-12'::date,
    '7.7',
    'Hydrogenera / FBK'
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '81e859be-9680-4e97-aff7-d9853e9bada3'::uuid,
    v_project_id,
    '8760b642-8bd1-4161-9b86-eb1877721e8b'::uuid,
    'Performance Test',
    '2027-11-15'::date,
    3,
    '7.8',
    'Hydrogenera / FBK',
    '#5B9BD5',
    'Planned',
    6
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '433e0548-a9d0-4f6d-ae5e-39ed9cc0304a'::uuid,
    v_project_id,
    '8760b642-8bd1-4161-9b86-eb1877721e8b'::uuid,
    'Site Acceptance Test (SAT)',
    '2027-11-18'::date,
    '7.9',
    'Hydrogenera / FBK'
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '83c298a5-70bf-4c09-96c7-5c8300e43d5d'::uuid,
    v_project_id,
    '8760b642-8bd1-4161-9b86-eb1877721e8b'::uuid,
    'Operator Training',
    '2027-11-18'::date,
    2,
    '7.10',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    7
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '08a21f3b-8d2a-49fc-8cce-b4a742929863'::uuid,
    v_project_id,
    '8760b642-8bd1-4161-9b86-eb1877721e8b'::uuid,
    'Final Documentation and CE Dossier',
    '2027-11-15'::date,
    8,
    '7.11',
    'Hydrogenera',
    '#5B9BD5',
    'Planned',
    8
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '5233e32f-14c5-4057-822a-a64835f03e29'::uuid,
    v_project_id,
    '8760b642-8bd1-4161-9b86-eb1877721e8b'::uuid,
    'Final Handover',
    '2027-11-22'::date,
    '7.12',
    'Hydrogenera / FBK'
  );

  insert into public.project_gantt_activities (
    id, project_id, phase_id, name, start_date, duration_days, wbs, owner, color, status, sort_order
  ) values (
    '8ce5b96b-6eed-4278-a0c3-9cc0f7ed0fc0'::uuid,
    v_project_id,
    '4981f7b9-d988-4392-bbcc-2748bde1d26a'::uuid,
    'Schedule Contingency / Final Close-out',
    '2027-11-23'::date,
    8,
    '8.1',
    'Hydrogenera / FBK',
    '#5B9BD5',
    'Planned',
    0
  );

  insert into public.project_gantt_deadlines (
    id, project_id, phase_id, name, date, wbs, owner
  ) values (
    '0ff4e688-ffc7-46b0-b7ba-02065613c085'::uuid,
    v_project_id,
    '4981f7b9-d988-4392-bbcc-2748bde1d26a'::uuid,
    'Contractual Completion Deadline',
    '2027-11-30'::date,
    '8.2',
    'Hydrogenera / FBK'
  );

  raise notice 'Gantt seeded for FBK project %: 8 phases, 27 activities, 13 milestones', v_project_id;
end $$;
