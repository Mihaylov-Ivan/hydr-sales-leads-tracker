-- ============================================================
-- Migration 050: prospect source "research" + optional activity summary
-- Additive / data-preserving.
--
-- Source and summary are already free text (no enum check).
-- This migration documents the new source value and ensures
-- prospect activity summaries may be empty strings.
-- ============================================================

-- Ensure summary can be blank (already default ''; reinforce defaults).
alter table public.prospect_activities
  alter column summary set default '';

update public.prospect_activities
set summary = ''
where summary is null;

alter table public.prospect_activities
  alter column summary set not null;

comment on column public.prospect_companies.source is
  'Lead source: email, phone, referral, linkedin, in-person, research, …';

comment on column public.prospect_contacts.source is
  'Contact source: email, phone, referral, linkedin, in-person, research, …';

comment on column public.prospect_activities.summary is
  'Optional outreach / engagement note; may be empty';
