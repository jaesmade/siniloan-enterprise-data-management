begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

select has_schema('core', 'core schema exists');
select has_schema('jobseekers', 'jobseekers schema exists');
select has_schema('research', 'research schema exists');
select has_schema('biometrics', 'biometrics schema exists');

select has_table('core', 'profiles', 'profiles table exists');
select has_table('core', 'user_dataset_grants', 'dataset grants table exists');
select has_table('core', 'audit_events', 'audit table exists');
select has_table('jobseekers', 'people', 'jobseeker people table exists');
select has_table('research', 'requests', 'research requests table exists');
select has_table('biometrics', 'device_events', 'biometric events table exists');

select is((select count(*)::integer from core.modules), 3, 'three modules are registered');
select is((select count(*)::integer from core.datasets), 3, 'three datasets are registered');

select ok((select relrowsecurity from pg_class where oid = 'core.profiles'::regclass), 'profiles has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'jobseekers.people'::regclass), 'jobseeker people has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'research.requests'::regclass), 'research requests has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'biometrics.device_events'::regclass), 'biometric events has RLS enabled');

select is(core.can_access_dataset('research_requests'), false, 'anonymous database context has no dataset access');

select * from finish();
rollback;
