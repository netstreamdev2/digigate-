-- A company's own logo and colour, so the dashboard looks like theirs once you're inside it. Logos are no one's personal
-- information, so they sit in a public bucket and load like any other image. Only the company's admins and super users
-- can put one there, under the company's own folder, and the browser redraws it as a small WebP (PNG on Safari) first.

begin;

insert into digigate.schema_version (version) values (22);

alter table digigate.organisations
  add column logo_path text check (logo_path ~ '^[0-9a-f-]{36}/logo-[0-9]+\.(webp|png)$'),
  add column brand_color text check (brand_color ~ '^#[0-9a-f]{6}$');

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('company-logos', 'company-logos', true, 300000, array['image/webp', 'image/png'])
    on conflict (id) do nothing;
  end if;
end;
$$;

-- The folder a logo sits in names its company. Anything that isn't a company's id can't be anyone's to write.
create function digigate.logo_company(_name text) returns uuid
language sql immutable set search_path = ''
as $$
  select case when split_part(_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(_name, '/', 1)::uuid end;
$$;
revoke all on function digigate.logo_company(text) from public;
grant execute on function digigate.logo_company(text) to authenticated;

do $$
begin
  if to_regclass('storage.objects') is not null then
    create policy company_logos_add on storage.objects for insert to authenticated
      with check (bucket_id = 'company-logos' and digigate.can_manage_org(digigate.logo_company(name)));
    create policy company_logos_remove on storage.objects for delete to authenticated
      using (bucket_id = 'company-logos' and digigate.can_manage_org(digigate.logo_company(name)));
    -- Removing needs the row to be found first; the bucket is public anyway, so this shows nothing new.
    create policy company_logos_read on storage.objects for select to authenticated
      using (bucket_id = 'company-logos' and digigate.can_manage_org(digigate.logo_company(name)));
  end if;
end;
$$;

-- Sets or clears the logo and colour; an empty value clears it. Admins can't change the rest of their company's row, so
-- this is their only way in. The audit trigger on organisations logs it as company.changed.
create function digigate.set_company_brand(_org uuid, _logo_path text, _color text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _path text := nullif(_logo_path, '');
begin
  if not digigate.can_manage_org(_org) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if _path is not null and digigate.logo_company(_path) is distinct from _org then
    raise exception 'logo belongs to another company' using errcode = '22023';
  end if;
  update digigate.organisations set logo_path = _path, brand_color = lower(nullif(_color, '')) where id = _org;
end;
$$;
revoke all on function digigate.set_company_brand(uuid, text, text) from public;
grant execute on function digigate.set_company_brand(uuid, text, text) to authenticated;

-- The super user's companies, now with each one's logo and colour and a live sense of how it's doing.
drop function digigate.company_board(text, integer, integer);
create function digigate.company_board(_search text, _limit integer, _offset integer)
returns table (
  id uuid, name text, is_active boolean, logo_path text, brand_color text,
  clients bigint, sites bigint, gate_staff bigint, on_site bigint, open_alerts bigint, total bigint
)
language sql stable security definer set search_path = ''
as $$
  select
    o.id,
    o.name,
    o.is_active,
    o.logo_path,
    o.brand_color,
    (select count(*) from digigate.clients c where c.org_id = o.id),
    (select count(*) from digigate.sites s where s.org_id = o.id),
    (select count(*) from digigate.gate_users g where g.org_id = o.id),
    -- Through each site, so both counts use the partial indexes on what's still open.
    (select count(*) from digigate.visits v join digigate.sites s on s.id = v.site_id where s.org_id = o.id and v.exited_at is null),
    (select count(*) from digigate.alerts a join digigate.sites s on s.id = a.site_id
      where s.org_id = o.id and a.status = 'open' and a.severity = 'red'),
    count(*) over ()
  from digigate.organisations o
  where (select digigate.is_super_user()) and (_search = '' or o.name ilike _search)
  order by o.name
  limit least(_limit, 100) offset _offset;
$$;
revoke all on function digigate.company_board(text, integer, integer) from public;
grant execute on function digigate.company_board(text, integer, integer) to authenticated;

commit;
