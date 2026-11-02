-- The dashboard reads a new site straight back after creating it. The list of visible sites was worked out before the
-- row existed, so the read failed and took the whole save with it. Whoever may manage a site can always see it.

begin;

insert into digigate.schema_version (version) values (4);

drop policy sites_read on digigate.sites;
create policy sites_read on digigate.sites for select to authenticated
  using (id = any ((select digigate.visible_site_ids())::uuid[]) or digigate.can_manage_org(org_id));

commit;
