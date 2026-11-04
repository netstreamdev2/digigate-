-- An access point's location set from the handheld: a supervisor stands at the gate and the device saves its GPS
-- position. It travels as an ordinary gate event, so it works offline and arrives with the next sync; this applies it
-- once its details are stored. Only an active supervisor of the device's own company can move an access point, and
-- only one at the device's own site. Each move is logged under the supervisor who confirmed it.

begin;

insert into digigate.schema_version (version) values (21);

create function digigate.apply_post_location() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _device uuid;
  _supervisor text;
  _label text;
  _latitude double precision;
  _longitude double precision;
  _radius integer;
begin
  select e.device_id into _device from digigate.events e where e.id = new.event_id and e.type = 'post_location_set';
  if _device is null then
    return null;
  end if;

  select trim(g.first_name || ' ' || g.last_name) into _supervisor
  from digigate.gate_users g
  where g.id = new.gate_user_id and g.org_id = new.org_id and g.role = 'supervisor' and g.is_active;
  if _supervisor is null then
    return null;
  end if;

  begin
    _latitude := (new.payload ->> 'latitude')::double precision;
    _longitude := (new.payload ->> 'longitude')::double precision;
    _radius := (new.payload ->> 'radius_m')::integer;
  exception when others then
    return null;
  end;
  if _latitude is null or _longitude is null or _radius is null
    or _latitude not between -90 and 90 or _longitude not between -180 and 180 or _radius not between 30 and 1000 then
    return null;
  end if;

  update digigate.posts p
  set latitude = _latitude, longitude = _longitude, radius_m = _radius
  where p.site_id = new.site_id and p.org_id = new.org_id and p.code = new.payload ->> 'post'
  returning p.label into _label;
  if _label is null then
    return null;
  end if;

  perform digigate.write_audit(new.org_id, new.site_id, _device, 'gate', 'gate.post_located', null, _supervisor, _label, _radius || ' m geofence');
  return null;
end;
$$;
revoke all on function digigate.apply_post_location() from public;

create trigger event_details_post_location after insert on digigate.event_details
  for each row when (new.payload ? 'post' and new.payload ? 'latitude') execute function digigate.apply_post_location();

commit;
