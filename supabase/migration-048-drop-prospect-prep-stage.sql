-- Remove the prospecting "prep" stage from the pipeline.
-- Additive / data-preserving: remaps status only; prep columns are kept.
--
-- New flow: target-identified (prepare list) → contacted (Contacted action).
-- Legacy status "contact-prepared" is collapsed into "target-identified"
-- so those rows stay on the prepare list awaiting Contacted.

update public.prospect_contacts
set
  status = 'target-identified',
  updated_at = now()
where status = 'contact-prepared';

update public.prospect_companies
set
  status = 'target-identified',
  updated_at = now()
where status = 'contact-prepared';

-- Prep detail columns (personalization_note, draft_message, planned_channel,
-- planned_contact_date, prepared_at, contact_objective, outreach_angle) are
-- intentionally retained so existing values are not lost. The app no longer
-- writes or surfaces them as a prep step.
