-- Fake volume for checking the dashboard at scale: 60 security companies with 80 clients each, every client with one
-- site and one post, and one busy client with 30 more sites and 300 gate staff. Test projects only.
-- The companies have realistic made-up names so the screens read naturally. Their slugs all start with load-test-,
-- which is how load-test-remove.sql finds them and takes it all out again.

begin;

insert into digigate.organisations (name, slug)
select company.name, 'load-test-' || lpad(company.position::text, 2, '0')
from unnest(array[
  'Amberfield Guarding', 'Aloe Ridge Security', 'Bateleur Protection', 'Bluegum Risk Services', 'Bushwillow Security',
  'Cedar Point Guarding', 'Coral Tree Protection', 'Crane Valley Security', 'Driftwood Risk Services', 'Eland Crest Guarding',
  'Ember Hill Security', 'Fairhaven Protection', 'Fynbos Guarding', 'Goldcrest Security', 'Greenkloof Risk Services',
  'Hadeda Protection', 'Harbourline Security', 'Highveld Crest Guarding', 'Ironwood Protection', 'Jacaranda Row Security',
  'Karee Hill Guarding', 'Kestrel Ridge Security', 'Kloofview Protection', 'Kudu Gate Risk Services', 'Lakeshore Guarding',
  'Leadwood Security', 'Lionsrock Protection', 'Longkloof Risk Services', 'Marula Crest Security', 'Meadowbank Guarding',
  'Mistbelt Protection', 'Mopane Ridge Security', 'Msasa Risk Services', 'Northwind Guarding', 'Oakvale Security',
  'Olivewood Protection', 'Orchard Hill Guarding', 'Palmiet Risk Services', 'Pinnacle Bay Security', 'Quartzite Protection',
  'Quiver Tree Guarding', 'Redwater Security', 'Riverbend Risk Services', 'Rooikrans Protection', 'Sable Ridge Security',
  'Saltwood Guarding', 'Sandstone Protection', 'Silverleaf Security', 'Stonebridge Risk Services', 'Sunbird Guarding',
  'Tambuti Protection', 'Thornveld Security', 'Tidewater Guarding', 'Umbrella Thorn Risk Services', 'Valleyview Protection',
  'Waterbuck Security', 'Whitestone Guarding', 'Wild Fig Protection', 'Windhaven Security', 'Yellowwood Risk Services'
]) with ordinality as company (name, position);

insert into digigate.clients (org_id, name)
select o.id, case when n % 3 = 0 then 'Test Estate ' else 'Test Hospital ' end || right(o.slug, 2) || '-' || lpad(n::text, 2, '0')
from digigate.organisations o
cross join generate_series(1, 80) as n
where o.slug like 'load-test-%';

insert into digigate.sites (org_id, client_id, name, site_type)
select c.org_id, c.id, 'Main Site', case when c.name like 'Test Estate%' then 'estate' else 'hospital' end
from digigate.clients c
join digigate.organisations o on o.id = c.org_id
where o.slug like 'load-test-%';

insert into digigate.sites (org_id, client_id, name, site_type)
select c.org_id, c.id, 'Extra Site ' || lpad(n::text, 2, '0'), 'hospital'
from digigate.clients c
join digigate.organisations o on o.id = c.org_id
cross join generate_series(1, 30) as n
where o.slug = 'load-test-01' and c.name = 'Test Hospital 01-01';

insert into digigate.posts (org_id, site_id, code, label, lanes)
select s.org_id, s.id, 'main-gate', 'Main Gate', array['vehicle', 'pedestrian']
from digigate.sites s
join digigate.organisations o on o.id = s.org_id
where o.slug like 'load-test-%';

-- These PINs can never match: the hash is empty.
insert into digigate.gate_users (org_id, site_ids, employee_number, first_name, last_name, role, pin)
select s.org_id, array[s.id], (90000 + n)::text, 'Test', 'Guard ' || lpad(n::text, 3, '0'), case when n % 20 = 0 then 'supervisor' else 'guard' end,
  '{"algorithm":"pbkdf2-sha256","iterations":1,"salt":"","hash":""}'
from digigate.sites s
join digigate.clients c on c.id = s.client_id
join digigate.organisations o on o.id = s.org_id
cross join generate_series(1, 300) as n
where o.slug = 'load-test-01' and c.name = 'Test Hospital 01-01' and s.name = 'Main Site';

commit;
