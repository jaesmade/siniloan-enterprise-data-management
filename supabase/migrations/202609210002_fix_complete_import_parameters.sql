begin;

drop function core.complete_import(uuid, integer, integer, jsonb);

create function core.complete_import(
  p_import_job_id uuid,
  p_accepted_rows integer,
  p_rejected_rows integer,
  p_row_errors jsonb default '[]'::jsonb
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
  where id = p_import_job_id;

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
    p_import_job_id,
    greatest(coalesce((item ->> 'source_row_number')::integer, 1), 1),
    item ->> 'field_name',
    coalesce(item ->> 'error_code', 'invalid_row'),
    coalesce(item ->> 'message', 'The row could not be imported.'),
    coalesce(item -> 'safe_context', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_row_errors, '[]'::jsonb)) item;

  update core.import_jobs
  set status = 'completed',
      processed_rows = greatest(p_accepted_rows, 0) + greatest(p_rejected_rows, 0),
      accepted_rows = greatest(p_accepted_rows, 0),
      rejected_rows = greatest(p_rejected_rows, 0),
      completed_at = now()
  where id = p_import_job_id;

  insert into core.audit_events (
    actor_id, dataset_id, action, target_type, target_id, summary, metadata
  ) values (
    auth.uid(), target_job.dataset_id, 'import.completed', 'import_job',
    p_import_job_id::text, 'Dataset import completed',
    jsonb_build_object(
      'filename', target_job.source_filename,
      'accepted_rows', greatest(p_accepted_rows, 0),
      'rejected_rows', greatest(p_rejected_rows, 0)
    )
  );
end;
$$;

revoke all on function core.complete_import(uuid, integer, integer, jsonb) from public;
grant execute on function core.complete_import(uuid, integer, integer, jsonb) to authenticated;

drop function core.fail_import(uuid, text);

create function core.fail_import(
  p_import_job_id uuid,
  p_failure_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update core.import_jobs
  set status = 'failed',
      error_message = left(coalesce(p_failure_message, 'Import failed'), 1000),
      completed_at = now()
  where id = p_import_job_id
    and (requested_by = auth.uid() or core.is_active_admin('dpo'));
end;
$$;

revoke all on function core.fail_import(uuid, text) from public;
grant execute on function core.fail_import(uuid, text) to authenticated;

commit;
