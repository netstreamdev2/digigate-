-- Some phones (a Samsung A54, for one) ignore the small picture size the app asks for and take a full-size photo of a
-- megabyte or more. The server refused those, the handheld let them go, and the shift showed its photo as still on its
-- way for good. Until the app shrinks the photo itself (it needs a new build), the server takes photos up to 3 MB.

begin;

insert into digigate.schema_version (version) values (26);

do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set file_size_limit = 3000000 where id = 'shift-selfies';
  end if;
end;
$$;

commit;
