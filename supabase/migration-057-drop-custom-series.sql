-- ============================================================
-- migration-057: remove "Custom" system type → "Z Series"
-- Preview affected rows, then rewrite series/product tags.
-- ============================================================

-- 1) Preview: projects that currently include Custom
select id, name, client, series as series_before
from public.projects
where series = 'Custom'
   or series like 'Custom +%'
   or series like '%+ Custom'
   or series like '%+ Custom +%';

-- 2) Preview: prospect companies that currently include Custom
select id, name, product as system_before
from public.prospect_companies
where product = 'Custom'
   or product like 'Custom +%'
   or product like '%+ Custom'
   or product like '%+ Custom +%';

-- Helper: replace Custom with Z Series, dedupe, keep canonical order.
create or replace function public._series_drop_custom(series text)
returns text
language plpgsql
immutable
as $$
declare
  part text;
  mapped text;
  tags text[] := array[]::text[];
  ordered text[] := array['Z Series', 'E Series', 'w/ Stargate', 'MH'];
  t text;
  result text;
begin
  if series is null or btrim(series) = '' then
    return 'Z Series';
  end if;

  foreach part in array string_to_array(series, '+') loop
    mapped := btrim(part);
    if mapped = 'Custom' then
      mapped := 'Z Series';
    end if;
    if mapped = any (ordered) and not (mapped = any (tags)) then
      tags := array_append(tags, mapped);
    end if;
  end loop;

  if coalesce(cardinality(tags), 0) = 0 then
    return 'Z Series';
  end if;

  result := null;
  foreach t in array ordered loop
    if t = any (tags) then
      result := case when result is null then t else result || ' + ' || t end;
    end if;
  end loop;

  return coalesce(result, 'Z Series');
end;
$$;

-- 3) Apply to projects
update public.projects
set series = public._series_drop_custom(series)
where series = 'Custom'
   or series like 'Custom +%'
   or series like '%+ Custom'
   or series like '%+ Custom +%';

-- 4) Apply to prospect companies (product column stores system tags)
update public.prospect_companies
set product = public._series_drop_custom(product)
where product = 'Custom'
   or product like 'Custom +%'
   or product like '%+ Custom'
   or product like '%+ Custom +%';

-- 5) Confirm nothing left with Custom
select 'projects' as table_name, count(*)::int as still_custom
from public.projects
where series = 'Custom'
   or series like 'Custom +%'
   or series like '%+ Custom'
   or series like '%+ Custom +%'
union all
select 'prospect_companies', count(*)::int
from public.prospect_companies
where product = 'Custom'
   or product like 'Custom +%'
   or product like '%+ Custom'
   or product like '%+ Custom +%';

comment on column public.projects.series is
  'System categories joined with " + " (Z Series, E Series, w/ Stargate, MH)';

comment on column public.prospect_companies.product is
  'System tags joined with " + " (same values as projects.series: Z Series, E Series, w/ Stargate, MH)';

drop function if exists public._series_drop_custom(text);
