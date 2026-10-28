-- Demo data for development only, matching the gate app's demo seed list. Never run against a customer project.
-- Gate users: 1001 → PIN 246810, 1002 → 135790, 2001 → 802460.
-- Pairing code for the demo device: 4829130576 (valid 7 days from seeding, single use).

insert into public.organisations (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Demo Hospital Group');

insert into public.sites (id, org_id, name, site_type)
values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Demo Hospital', 'hospital');

insert into public.gates (id, org_id, site_id, name, lane)
values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  'Main Gate',
  'vehicle'
);

insert into public.devices (id, org_id, site_id, gate_id, name)
values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  'Main Gate DT50'
);

insert into public.device_pairing_codes (code_hash, org_id, device_id, expires_at)
values (
  '5429176b5c3930506d5b1c6b6510facbb0142ed25a79e034f91ab23814d491e5',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000301',
  now() + interval '7 days'
);

insert into public.gate_users (org_id, site_id, employee_number, first_name, last_name, role, pin_hash)
values
  (
    '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
    '1001', 'Thabo', 'Khumalo', 'guard',
    '{"algorithm":"pbkdf2-sha256","iterations":20000,"salt":"ud1r8nMdjDUlEmsDZ7enbQ==","hash":"tl6g3j2ZKNvPNuMyQUh6poi4HlLrBZ7wwMXQzWYrzuI="}'
  ),
  (
    '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
    '1002', 'Zanele', 'Mthembu', 'guard',
    '{"algorithm":"pbkdf2-sha256","iterations":20000,"salt":"v1SJ4VSD7kggX27WAMJTpA==","hash":"RoLOix+KzzZlD1sZFq+RlvU1gb3tKmtxWwKpY5WvI1I="}'
  ),
  (
    '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
    '2001', 'Kagiso', 'Molefe', 'supervisor',
    '{"algorithm":"pbkdf2-sha256","iterations":20000,"salt":"lWmmwUd3njJwr8vxe1lfNA==","hash":"w4m/oMnCt0d/vonxxNSKLQkZ6CWbZyqqU2L4EjrmoNA="}'
  );
