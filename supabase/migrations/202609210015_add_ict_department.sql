begin;

insert into core.departments (code, name)
select 'ICTO', 'Siniloan Information Communications and Technology Office'
where not exists (
  select 1 from core.departments where lower(code) = 'icto'
);

update core.departments
set name = 'Siniloan Information Communications and Technology Office',
    is_active = true
where lower(code) = 'icto';

commit;
