-- Takes out everything load-test-add.sql put in, and nothing else: it only touches the load-test companies.

begin;

create temporary table load_test_orgs on commit drop as
  select id from digigate.organisations where slug like 'load-test-%';

delete from digigate.report_sends where org_id in (select id from load_test_orgs);
delete from digigate.report_schedules where org_id in (select id from load_test_orgs);
delete from digigate.daily_activity where org_id in (select id from load_test_orgs);
delete from digigate.gate_users where org_id in (select id from load_test_orgs);
delete from digigate.posts where org_id in (select id from load_test_orgs);
delete from digigate.sites where org_id in (select id from load_test_orgs);
delete from digigate.engagements where org_id in (select id from load_test_orgs);
delete from digigate.clients where org_id in (select id from load_test_orgs);
delete from digigate.organisations where id in (select id from load_test_orgs);

commit;
