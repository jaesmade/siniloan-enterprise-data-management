begin;

alter table core.import_jobs
  add column if not exists file_sha256 text,
  add column if not exists validation_summary jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists import_jobs_dataset_checksum_idx
  on core.import_jobs (dataset_id, file_sha256, created_at desc)
  where file_sha256 is not null;

create or replace function core.set_import_fingerprint(
  p_import_job_id uuid,
  p_file_sha256 text,
  p_validation_summary jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update core.import_jobs
  set file_sha256 = left(p_file_sha256, 128),
      validation_summary = coalesce(p_validation_summary, '{}'::jsonb),
      updated_at = now()
  where id = p_import_job_id
    and (requested_by = auth.uid() or core.is_active_admin('dpo'));
end;
$$;

create or replace function core.update_import_progress(
  p_import_job_id uuid,
  p_processed_rows integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update core.import_jobs
  set processed_rows = greatest(0, least(p_processed_rows, total_rows)),
      updated_at = now()
  where id = p_import_job_id
    and status = 'processing'
    and (requested_by = auth.uid() or core.is_active_admin('dpo'));
end;
$$;

revoke all on function core.update_import_progress(uuid, integer) from public;
revoke all on function core.set_import_fingerprint(uuid, text, jsonb) from public;
grant execute on function core.update_import_progress(uuid, integer) to authenticated;
grant execute on function core.set_import_fingerprint(uuid, text, jsonb) to authenticated;

commit;
