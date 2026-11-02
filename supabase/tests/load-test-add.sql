-- Fake volume for checking the dashboard at scale: 60 security companies with 80 clients each, every client with one
-- site and one post, and one busy client with 30 more sites and 300 gate staff. Test projects only.
-- Everything has a realistic made-up name so the screens read naturally. The companies' slugs all start with load-test-,
-- which is how load-test-remove.sql finds them and takes it all out again.

begin;

-- Each client is numbered 0 to 4799, and its names come from that number, so every run gives the same ones. Stepping
-- through word lists of 61 and 59 by 7 and 13 gives each number its own pair of words, and the first client to repeat a
-- pair gets a different ending.
create function pg_temp.is_estate(_index integer) returns boolean
language sql immutable as $$
  select (_index % 80 + 1) % 3 = 0;
$$;

create function pg_temp.client_name(_index integer) returns text
language sql immutable as $$
  select (array[
    'Acacia', 'Aloe', 'Amber', 'Ash', 'Baobab', 'Beech', 'Birch', 'Blue Crane', 'Bluegum', 'Bushbuck',
    'Camphor', 'Cedar', 'Cherry', 'Clivia', 'Copper', 'Coral', 'Cypress', 'Daisy', 'Dune', 'Eagle',
    'Elm', 'Erica', 'Falcon', 'Fern', 'Fig', 'Fish Eagle', 'Fynbos', 'Gold', 'Grey Heron', 'Hawk',
    'Hazel', 'Heron', 'Hibiscus', 'Holly', 'Ivory', 'Jasmine', 'Kingfisher', 'Kudu', 'Lark', 'Lavender',
    'Lily', 'Maple', 'Marula', 'Mimosa', 'Mist', 'Moss', 'Nyala', 'Oak', 'Olive', 'Pearl',
    'Pine', 'Protea', 'Quartz', 'Robin', 'Rose', 'Sage', 'Sand', 'Silver', 'Spring', 'Stone',
    'Sugarbush'
  ])[_index * 7 % 61 + 1] || ' ' || (array[
    'Bank', 'Bay', 'Bend', 'Bluff', 'Bridge', 'Brook', 'Cliff', 'Close', 'Coast', 'Court',
    'Cove', 'Creek', 'Crest', 'Crossing', 'Dale', 'Dell', 'Downs', 'Drift', 'Falls', 'Farm',
    'Field', 'Ford', 'Forest', 'Gate', 'Glade', 'Glen', 'Green', 'Grove', 'Harbour', 'Haven',
    'Heath', 'Hill', 'Hollow', 'Island', 'Kloof', 'Lake', 'Landing', 'Lea', 'Meadow', 'Mews',
    'Mill', 'Mount', 'Nook', 'Peak', 'Point', 'Pond', 'Ridge', 'Rise', 'River', 'Rock',
    'Shore', 'Spruit', 'Terrace', 'Vale', 'Valley', 'View', 'Vlei', 'Wood', 'Woods'
  ])[_index * 13 % 59 + 1] || ' ' || case
    when pg_temp.is_estate(_index) then
      (array['Estate', 'Country Estate', 'Golf Estate', 'Eco Estate', 'Lifestyle Estate', 'Security Estate', 'Retirement Village'])[_index % 7 + 1]
    else
      (array['Hospital', 'Private Hospital', 'Memorial Hospital', 'Medical Centre', 'Day Hospital', 'Community Hospital', 'Clinic'])[_index % 7 + 1]
  end;
$$;

create function pg_temp.site_name(_index integer) returns text
language sql immutable as $$
  select case
    when pg_temp.is_estate(_index) then (array['Main Estate', 'Phase 1', 'Phase 2', 'North Side', 'South Side'])[_index % 5 + 1]
    else (array['Main Campus', 'North Campus', 'South Campus', 'East Campus', 'West Campus'])[_index % 5 + 1]
  end;
$$;

-- The busy client's 30 further sites, numbered from 1.
create function pg_temp.extra_site_name(_number integer) returns text
language sql immutable as $$
  select (array['North', 'South', 'East', 'West', 'Central', 'Riverside'])[(_number - 1) / 5 + 1] || ' '
    || (array['Clinic', 'Day Ward', 'Outpatients', 'Pharmacy', 'Wellness Centre'])[(_number - 1) % 5 + 1];
$$;

-- The busy client's gate staff, numbered from 1.
create function pg_temp.first_name(_number integer) returns text
language sql immutable as $$
  select (array[
    'Sipho', 'Lerato', 'Thandi', 'Mandla', 'Nomsa', 'Bongani', 'Zanele', 'Themba', 'Ayanda', 'Nandi',
    'Kagiso', 'Lindiwe', 'Sibusiso', 'Palesa', 'Tshepo', 'Naledi', 'Lungile', 'Mpho', 'Dumisani', 'Busisiwe',
    'Andile', 'Refilwe', 'Jabu', 'Nokuthula', 'Vusi', 'Siphesihle', 'Pieter', 'Anika', 'Johan', 'Marlene',
    'Ashwin', 'Fatima', 'Yusuf', 'Cheryl', 'Reginald', 'Tendai', 'Farai'
  ])[_number * 5 % 37 + 1];
$$;

create function pg_temp.last_name(_number integer) returns text
language sql immutable as $$
  select (array[
    'Dlamini', 'Nkosi', 'Khumalo', 'Mokoena', 'Mthembu', 'Ndlovu', 'Sithole', 'Zulu', 'Mahlangu', 'Molefe',
    'Mabaso', 'Cele', 'Ngcobo', 'Shabalala', 'Radebe', 'Maseko', 'Tshabalala', 'Gumede', 'Buthelezi', 'Mkhize',
    'Xaba', 'Nxumalo', 'Moyo', 'Phiri', 'Botha', 'Van Wyk', 'Nel', 'Jacobs', 'Adams', 'Petersen',
    'Naidoo', 'Pillay', 'Govender', 'Hendricks', 'Daniels', 'Williams', 'Smith', 'Fortuin', 'Mbatha', 'Hadebe',
    'Majola'
  ])[_number * 7 % 41 + 1];
$$;

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

create temporary table load_test_clients on commit drop as
  select (right(o.slug, 2)::integer - 1) * 80 + n - 1 as index, o.id as org_id, gen_random_uuid() as client_id
  from digigate.organisations o
  cross join generate_series(1, 80) as n
  where o.slug like 'load-test-%';

insert into digigate.clients (id, org_id, name)
select client_id, org_id, pg_temp.client_name(index)
from load_test_clients;

insert into digigate.sites (org_id, client_id, name, site_type)
select org_id, client_id, pg_temp.site_name(index), case when pg_temp.is_estate(index) then 'estate' else 'hospital' end
from load_test_clients;

-- These PINs can never match: the hash is empty.
insert into digigate.gate_users (org_id, site_ids, employee_number, first_name, last_name, role, pin)
select s.org_id, array[s.id], (90000 + n)::text, pg_temp.first_name(n), pg_temp.last_name(n), case when n % 20 = 0 then 'supervisor' else 'guard' end,
  '{"algorithm":"pbkdf2-sha256","iterations":1,"salt":"","hash":""}'
from load_test_clients c
join digigate.sites s on s.client_id = c.client_id
cross join generate_series(1, 300) as n
where c.index = 0;

insert into digigate.sites (org_id, client_id, name, site_type)
select org_id, client_id, pg_temp.extra_site_name(n), 'hospital'
from load_test_clients
cross join generate_series(1, 30) as n
where index = 0;

insert into digigate.posts (org_id, site_id, code, label, lanes)
select s.org_id, s.id, 'main-gate', 'Main Gate', array['vehicle', 'pedestrian']
from digigate.sites s
join digigate.organisations o on o.id = s.org_id
where o.slug like 'load-test-%';

commit;
