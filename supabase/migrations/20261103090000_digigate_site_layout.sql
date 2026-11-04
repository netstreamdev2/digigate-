-- How a site is laid out, so it can be mapped properly when it's set up: the site's code, address, geofence and parking,
-- and for each access point its type, its booms (each automatic or manual), whether it's manned, and its cameras. A site
-- and all its access points are created together by create_site, which runs with the caller's own rights, so the row
-- security that guards sites and posts guards this too. Access points are still the `posts` table.

begin;

insert into digigate.schema_version (version) values (16);

alter table digigate.sites
  add column code text check (code ~ '^[A-Z0-9]{2,8}$'),
  add column address text check (char_length(address) <= 300),
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180),
  add column radius_m integer check (radius_m between 30 and 20000),
  add column open_parking boolean not null default true,
  add column parking_spaces integer check (parking_spaces between 1 and 100000),
  add constraint sites_location_whole check ((latitude is null) = (longitude is null) and (latitude is null) = (radius_m is null)),
  add constraint sites_parking_counted check (open_parking or parking_spaces is not null);
create unique index sites_code_per_company on digigate.sites (org_id, code) where code is not null;

alter table digigate.posts
  add column gate_type text not null default 'main' check (gate_type in ('main', 'pedestrian', 'contractor', 'service')),
  add column booms text[] not null default '{}' check (booms <@ array['automatic', 'manual'] and cardinality(booms) <= 12),
  add column manned boolean not null default true,
  add column cctv_cameras integer not null default 0 check (cctv_cameras between 0 and 50),
  add column anpr boolean not null default false,
  add constraint posts_anpr_needs_cameras check (not anpr or cctv_cameras > 0);

grant insert (code, address, latitude, longitude, radius_m, open_parking, parking_spaces) on digigate.sites to authenticated;
grant update (code, address, latitude, longitude, radius_m, open_parking, parking_spaces) on digigate.sites to authenticated;
grant insert (gate_type, booms, manned, cctv_cameras, anpr) on digigate.posts to authenticated;
grant update (gate_type, booms, manned, cctv_cameras, anpr) on digigate.posts to authenticated;

-- A post's code is made from its name, and stays unique within the site: "Main Gate", "Main Gate" gives main-gate and
-- main-gate-2.
create function digigate.post_code_for(_site uuid, _label text) returns text
language sql stable set search_path = ''
as $$
  with base as (
    select coalesce(nullif(trim(both '-' from regexp_replace(lower(_label), '[^a-z0-9]+', '-', 'g')), ''), 'access-point') as code
  )
  select case
    when not exists (select 1 from digigate.posts p where p.site_id = _site and p.code = base.code) then base.code
    else base.code || '-' || (
      select min(n) from generate_series(2, 999) as n
      where not exists (select 1 from digigate.posts p where p.site_id = _site and p.code = base.code || '-' || n)
    )
  end
  from base;
$$;

-- The site wizard's one save: the site, then each access point in order, in one transaction. Runs as the caller, so it
-- can only do what they could do one row at a time.
create function digigate.create_site(_org uuid, _client uuid, _site jsonb, _access_points jsonb) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  _site_id uuid;
  _point jsonb;
begin
  if jsonb_typeof(_access_points) <> 'array' or jsonb_array_length(_access_points) not between 1 and 30 then
    raise exception 'A site needs between 1 and 30 access points.' using errcode = '22023';
  end if;

  insert into digigate.sites (org_id, client_id, name, site_type, code, address, latitude, longitude, radius_m, open_parking, parking_spaces)
  values (
    _org, _client, _site ->> 'name', _site ->> 'siteType', nullif(_site ->> 'code', ''), nullif(_site ->> 'address', ''),
    (_site ->> 'latitude')::double precision, (_site ->> 'longitude')::double precision, (_site ->> 'radiusM')::integer,
    coalesce((_site ->> 'openParking')::boolean, true), (_site ->> 'parkingSpaces')::integer
  )
  returning id into _site_id;

  for _point in select value from jsonb_array_elements(_access_points) loop
    insert into digigate.posts (org_id, site_id, code, label, lanes, latitude, longitude, radius_m, gate_type, booms, manned, cctv_cameras, anpr)
    values (
      _org, _site_id, digigate.post_code_for(_site_id, _point ->> 'label'), _point ->> 'label',
      array(select jsonb_array_elements_text(_point -> 'lanes')),
      (_point ->> 'latitude')::double precision, (_point ->> 'longitude')::double precision,
      coalesce((_point ->> 'radiusM')::integer, 50),
      coalesce(_point ->> 'gateType', 'main'),
      array(select jsonb_array_elements_text(coalesce(_point -> 'booms', '[]'))),
      coalesce((_point ->> 'manned')::boolean, true),
      coalesce((_point ->> 'cctvCameras')::integer, 0),
      coalesce((_point ->> 'anpr')::boolean, false)
    );
  end loop;

  return _site_id;
end;
$$;

revoke all on function digigate.post_code_for(uuid, text) from public;
revoke all on function digigate.create_site(uuid, uuid, jsonb, jsonb) from public;
grant execute on function digigate.post_code_for(uuid, text) to authenticated;
grant execute on function digigate.create_site(uuid, uuid, jsonb, jsonb) to authenticated;

commit;
