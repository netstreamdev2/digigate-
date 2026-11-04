-- A client and its site are one place: Harry Gwala Hospital is both who the security company serves and where its
-- gates are. The client row stays as the place's lasting record, the one that moves when it changes security company
-- and that view-only logins and reports hang from, but it now has exactly one site, made with it and named with it.

begin;

insert into digigate.schema_version (version) values (17);

-- Every place so far has one site, so this only holds that in place. Sites take their client's name.
create unique index sites_one_per_client on digigate.sites (client_id);
update digigate.sites s set name = c.name from digigate.clients c where c.id = s.client_id and s.name is distinct from c.name;

-- Renaming the site renames its client, so the two never disagree.
create function digigate.site_name_to_client() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update digigate.clients set name = new.name where id = new.client_id and name is distinct from new.name;
  return null;
end;
$$;
revoke all on function digigate.site_name_to_client() from public;

create trigger sites_name_to_client after update of name on digigate.sites
  for each row when (old.name is distinct from new.name) execute function digigate.site_name_to_client();

-- The site's own entries say it was added or renamed; logging its client as well would say everything twice. A move to
-- another security company only happens on the client, so that is still logged.
drop trigger audit_clients on digigate.clients;
create trigger audit_clients after update of org_id on digigate.clients
  for each row when (old.org_id is distinct from new.org_id) execute function digigate.audit_row('client', 'setup');

-- The site wizard makes the client with the site. `_client` is only given to finish a place added before this, which
-- has a client but no site yet.
create or replace function digigate.create_site(_org uuid, _client uuid, _site jsonb, _access_points jsonb) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  _client_id uuid := _client;
  _site_id uuid;
  _point jsonb;
begin
  if jsonb_typeof(_access_points) <> 'array' or jsonb_array_length(_access_points) not between 1 and 30 then
    raise exception 'A site needs between 1 and 30 access points.' using errcode = '22023';
  end if;

  if _client_id is null then
    insert into digigate.clients (org_id, name) values (_org, _site ->> 'name') returning id into _client_id;
  else
    if exists (select 1 from digigate.sites s where s.client_id = _client_id) then
      raise exception 'That place is set up already.' using errcode = '23514';
    end if;
    update digigate.clients set name = _site ->> 'name' where id = _client_id and org_id = _org;
    if not found then
      raise exception 'That place is not part of this company.' using errcode = '42501';
    end if;
  end if;

  insert into digigate.sites (org_id, client_id, name, site_type, code, address, latitude, longitude, radius_m, open_parking, parking_spaces)
  values (
    _org, _client_id, _site ->> 'name', _site ->> 'siteType', nullif(_site ->> 'code', ''), nullif(_site ->> 'address', ''),
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

commit;
