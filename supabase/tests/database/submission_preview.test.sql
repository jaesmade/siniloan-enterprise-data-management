begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_function('core', 'data_submission_preview', array['uuid'], 'bounded submission preview exists');
select ok(not has_function_privilege('anon', 'core.data_submission_preview(uuid)', 'EXECUTE'), 'anonymous callers cannot fetch previews');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000f101', 'preview-dpo@example.invalid', '{"full_name":"Preview test DPO","username":"preview_test_dpo"}'),
  ('00000000-0000-0000-0000-00000000f102', 'preview-staff@example.invalid', '{"full_name":"Preview test staff","username":"preview_test_staff"}');
update core.profiles set role='dpo', status='active' where id='00000000-0000-0000-0000-00000000f101';
update core.profiles set role='staff', status='active' where id='00000000-0000-0000-0000-00000000f102';

insert into core.data_submissions (id,dataset_id,submitted_by,submission_type,payload,total_rows)
select '00000000-0000-0000-0000-00000000f201', d.id, '00000000-0000-0000-0000-00000000f102', 'import',
  (select jsonb_agg(jsonb_build_object('source_row_number', n, 'requester_name', 'Test requester',
    'metadata', jsonb_build_object('extra', repeat('x',100)), 'raw_source', '{"hidden":"details"}'::jsonb) order by n)
   from generate_series(1,50) n), 50
from core.datasets d where d.slug='research_requests';
insert into core.data_submissions (id,dataset_id,submitted_by,submission_type,payload,total_rows,status)
select '00000000-0000-0000-0000-00000000f202', id, '00000000-0000-0000-0000-00000000f102', 'manual', '[{}]', 1, 'approved'
from core.datasets where slug='research_requests';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f101', true);
set local role authenticated;
select is(jsonb_array_length(core.data_submission_preview('00000000-0000-0000-0000-00000000f201')), 30, 'DPO preview is limited to 30 rows');
select is(core.data_submission_preview('00000000-0000-0000-0000-00000000f201')->0->>'source_row_number', '1', 'preview starts with the first source row');
select is(core.data_submission_preview('00000000-0000-0000-0000-00000000f201')->29->>'source_row_number', '30', 'preview preserves source order');
select ok(not (core.data_submission_preview('00000000-0000-0000-0000-00000000f201')->0 ?| array['metadata','raw_source']), 'unused source details are excluded');
select is(core.data_submission_preview('00000000-0000-0000-0000-00000000f202'), null::jsonb, 'completed submissions are not previewed');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f102', true);
select is(core.data_submission_preview('00000000-0000-0000-0000-00000000f201'), null::jsonb, 'non-DPO cannot preview even their own submission');
reset role;

select * from finish();
rollback;
