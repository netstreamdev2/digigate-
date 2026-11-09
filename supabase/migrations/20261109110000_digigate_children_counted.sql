-- Children are counted at the gate (2026-11-09): the guard now counts a car's people as men, women, boys, girls and
-- not sure. A child leaving in a car they didn't arrive in is the case that matters most, so the counts must reach the
-- control room and the evacuation list.
--
-- digigate.occupants_by_sex keeps only the keys it knows, so until now a boy or girl count would have been dropped on
-- the way in. It now keeps both. Counts only, never who; the totals the handheld sends already include children, so
-- OCCUPANT_COUNT_DROP and OCCUPANT_COUNT_RISE notice a child more or fewer like anyone else. Checks from before carry no
-- children and read as none.
--
-- Replacing the function keeps its grants, and apply_passage and check_detail call it by name, so nothing else changes.

begin;

insert into digigate.schema_version (version) values (35);

create or replace function digigate.occupants_by_sex(_value jsonb) returns jsonb
language sql immutable set search_path = ''
as $$
  select case when jsonb_typeof(_value) = 'object' then jsonb_build_object(
    'male', case when _value ->> 'male' ~ '^\d{1,2}$' then (_value ->> 'male')::integer else 0 end,
    'female', case when _value ->> 'female' ~ '^\d{1,2}$' then (_value ->> 'female')::integer else 0 end,
    'boy', case when _value ->> 'boy' ~ '^\d{1,2}$' then (_value ->> 'boy')::integer else 0 end,
    'girl', case when _value ->> 'girl' ~ '^\d{1,2}$' then (_value ->> 'girl')::integer else 0 end,
    'unknown', case when _value ->> 'unknown' ~ '^\d{1,2}$' then (_value ->> 'unknown')::integer else 0 end
  ) end;
$$;

commit;
