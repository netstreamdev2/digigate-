-- Indexes for the lookups the dashboard's lists make, so they stay fast at hundreds of sites and thousands of guards.

begin;

insert into digigate.schema_version (version) values (6);

create index sites_client on digigate.sites (client_id);
create index gate_users_sites on digigate.gate_users using gin (site_ids);

commit;
