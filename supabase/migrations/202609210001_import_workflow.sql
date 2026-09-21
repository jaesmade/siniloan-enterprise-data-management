begin;

create or replace function core.begin_import(
  dataset_slug text,
  source_filename text,
  total_rows integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_dataset_id uuid;
  new_job_id uuid;
begin
  if auth.uid() is null or not core.can_access_dataset(dataset_slug, 'read_write') then
    raise exception 'Import access denied';
  end if;

  select id into target_dataset_id
  from core.datasets
  where slug = dataset_slug;

  if target_dataset_id is null then
    raise exception 'Unknown dataset';
  end if;

  insert into core.import_jobs (
    dataset_id, requested_by, status, source_filename, mapping_version,
    total_rows, started_at
  ) values (
    target_dataset_id, auth.uid(), 'processing', source_filename,
    'built-in-v1', greatest(total_rows, 0), now()
  ) returning id into new_job_id;

  return new_job_id;
end;
$$;

create or replace function core.complete_import(
  import_job_id uuid,
  accepted_rows integer,
  rejected_rows integer,
  row_errors jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job core.import_jobs%rowtype;
begin
  select * into target_job
  from core.import_jobs
  where id = import_job_id;

  if target_job.id is null or (
    target_job.requested_by <> auth.uid()
    and not core.is_active_admin('dpo')
  ) then
    raise exception 'Import job access denied';
  end if;

  insert into core.import_row_errors (
    import_job_id, source_row_number, field_name, error_code, message, safe_context
  )
  select
    import_job_id,
    greatest(coalesce((item ->> 'source_row_number')::integer, 1), 1),
    item ->> 'field_name',
    coalesce(item ->> 'error_code', 'invalid_row'),
    coalesce(item ->> 'message', 'The row could not be imported.'),
    coalesce(item -> 'safe_context', '{}'::jsonb)
  from jsonb_array_elements(coalesce(row_errors, '[]'::jsonb)) item;

  update core.import_jobs
  set status = 'completed',
      processed_rows = greatest(accepted_rows, 0) + greatest(rejected_rows, 0),
      accepted_rows = greatest(accepted_rows, 0),
      rejected_rows = greatest(rejected_rows, 0),
      completed_at = now()
  where id = import_job_id;

  insert into core.audit_events (
    actor_id, dataset_id, action, target_type, target_id, summary, metadata
  ) values (
    auth.uid(), target_job.dataset_id, 'import.completed', 'import_job',
    import_job_id::text, 'Dataset import completed',
    jsonb_build_object(
      'filename', target_job.source_filename,
      'accepted_rows', greatest(accepted_rows, 0),
      'rejected_rows', greatest(rejected_rows, 0)
    )
  );
end;
$$;

create or replace function core.fail_import(
  import_job_id uuid,
  failure_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update core.import_jobs
  set status = 'failed',
      error_message = left(coalesce(failure_message, 'Import failed'), 1000),
      completed_at = now()
  where id = import_job_id
    and (requested_by = auth.uid() or core.is_active_admin('dpo'));
end;
$$;

revoke all on function core.begin_import(text, text, integer) from public;
revoke all on function core.complete_import(uuid, integer, integer, jsonb) from public;
revoke all on function core.fail_import(uuid, text) from public;
grant execute on function core.begin_import(text, text, integer) to authenticated;
grant execute on function core.complete_import(uuid, integer, integer, jsonb) to authenticated;
grant execute on function core.fail_import(uuid, text) to authenticated;

commit;
