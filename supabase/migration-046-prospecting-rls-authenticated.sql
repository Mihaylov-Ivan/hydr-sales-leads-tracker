-- Prospecting tables were anon-only; align with other CRM tables so
-- authenticated sessions can read/write the same rows.

drop policy if exists prospect_companies_anon_all on public.prospect_companies;
create policy prospect_companies_anon_all on public.prospect_companies
  for all to anon, authenticated using (true) with check (true);

drop policy if exists prospect_contacts_anon_all on public.prospect_contacts;
create policy prospect_contacts_anon_all on public.prospect_contacts
  for all to anon, authenticated using (true) with check (true);

drop policy if exists prospect_activities_anon_all on public.prospect_activities;
create policy prospect_activities_anon_all on public.prospect_activities
  for all to anon, authenticated using (true) with check (true);

drop policy if exists prospecting_targets_anon_all on public.prospecting_targets;
create policy prospecting_targets_anon_all on public.prospecting_targets
  for all to anon, authenticated using (true) with check (true);
