-- ============================================================
-- Migration 049: prospect multi market/system + drop Funding market
-- Additive / data-preserving.
--
-- 1) Strip "Funding" from projects + prospect_companies markets
--    (Funding lives on the EU Projects & RnD page now).
-- 2) Normalize prospect product values onto Sales system labels
--    (E-Series → E Series, Z-Series → Z Series). Column stays
--    named product; the app treats it as multi system tags.
-- 3) Fold Funding share into Clean H2 in prospecting_targets.
-- ============================================================

-- ---------- Helper: remove Funding tag from a " + "-joined market string ----------
-- Sole Funding → Clean H2. Combinations drop Funding and keep the rest.

create or replace function public._strip_funding_market(m text)
returns text
language plpgsql
immutable
as $$
declare
  parts text[];
  kept text[] := array[]::text[];
  p text;
  out text;
begin
  if m is null or btrim(m) = '' then
    return 'Clean H2';
  end if;
  parts := regexp_split_to_array(m, '\s*\+\s*');
  foreach p in array parts loop
    p := btrim(p);
    if p <> '' and p <> 'Funding' then
      kept := array_append(kept, p);
    end if;
  end loop;
  if coalesce(array_length(kept, 1), 0) = 0 then
    return 'Clean H2';
  end if;
  out := array_to_string(kept, ' + ');
  return out;
end;
$$;

update public.projects
set market = public._strip_funding_market(market)
where market is not null
  and (
    market = 'Funding'
    or market like 'Funding + %'
    or market like '% + Funding'
    or market like '% + Funding + %'
  );

update public.prospect_companies
set market = public._strip_funding_market(market)
where market is not null
  and (
    market = 'Funding'
    or market like 'Funding + %'
    or market like '% + Funding'
    or market like '% + Funding + %'
    or market in (
      'cng-optimisation',
      'cement',
      'generator-cooling',
      'industrial-h2',
      'h2-valleys'
    )
  );

-- Legacy single-id markets on prospects (if any remain)
update public.prospect_companies set market = 'Burner Optimisation' where market = 'cng-optimisation';
update public.prospect_companies set market = 'Cement' where market = 'cement';
update public.prospect_companies set market = 'Power Plants' where market = 'generator-cooling';
update public.prospect_companies set market = 'Clean H2' where market in ('industrial-h2', 'h2-valleys');

-- Prospect product → Sales system labels (column name unchanged)
update public.prospect_companies
set product = case product
  when 'E-Series' then 'E Series'
  when 'Z-Series' then 'Z Series'
  else product
end
where product in ('E-Series', 'Z-Series');

-- Fold Funding allocation into Clean H2 on prospecting targets
update public.prospecting_targets
set
  market_allocation =
    (coalesce(market_allocation, '{}'::jsonb) - 'Funding')
    || jsonb_build_object(
      'Clean H2',
      coalesce((market_allocation->>'Clean H2')::numeric, 0)
        + coalesce((market_allocation->>'Funding')::numeric, 0)
    ),
  updated_at = now()
where id = 1
  and market_allocation ? 'Funding';

comment on column public.projects.market is
  'Markets joined with " + " (Cement, Power Plants, Clean H2, Burner Optimisation, Tenders)';

comment on column public.prospect_companies.market is
  'Markets joined with " + " (same tags as projects.market)';

comment on column public.prospect_companies.product is
  'System tags joined with " + " (same values as projects.series: Z Series, E Series, Custom, w/ Stargate, MH)';

drop function if exists public._strip_funding_market(text);
