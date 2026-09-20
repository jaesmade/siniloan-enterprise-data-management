-- Active department names are needed by anonymous applicants during account registration.
grant usage on schema core to anon;
grant select on core.departments to anon;

create policy departments_read_for_signup
on core.departments
for select
to anon
using (is_active);
