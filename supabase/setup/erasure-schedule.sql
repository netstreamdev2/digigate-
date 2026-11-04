-- Run once per Supabase project, after the erasure migration (20261104160000): the nightly schedule calls this project's
-- own digigate-erasure function, so it needs the project's address. This is the test project's; another project uses
-- its own. It isn't a secret, but Vault is where the schedule reads its settings from.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'digigate_project_url') then
    perform vault.create_secret('https://fgtuednylvrknqeyxizz.supabase.co', 'digigate_project_url', 'This project''s own address, for the nightly erasure schedule');
  end if;
end;
$$;

select jobname, schedule, active from cron.job where jobname like 'digigate-%' order by jobname;
