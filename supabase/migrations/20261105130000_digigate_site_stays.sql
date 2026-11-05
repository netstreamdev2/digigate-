-- A site's own expected stays, set by its company's admins on the dashboard: minutes per visit type, or null for no
-- limit, over the site type's defaults (packages/core). Changes are logged like any other site change.

begin;

insert into digigate.schema_version (version) values (31);

alter table digigate.sites add constraint sites_stay_minutes_shape check (jsonb_typeof(stay_minutes) = 'object');
grant update (stay_minutes) on digigate.sites to authenticated;

commit;
