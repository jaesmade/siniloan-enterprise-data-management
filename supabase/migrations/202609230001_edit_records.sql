begin;

alter table biometrics.device_events
  add column version integer not null default 1 check (version > 0),
  add column updated_by uuid references core.profiles(id),
  add column updated_at timestamptz not null default now();

create function core.update_manual_record(
  p_module text, p_record_id uuid, p_version integer, p_data jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  dataset_slug text;
  dataset_id uuid;
  new_department uuid;
  old_department uuid;
  current_version integer;
  record_label text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_record_id is null or p_version is null or p_version < 1 then
    raise exception 'Invalid record version' using errcode = '22023';
  end if;
  if jsonb_typeof(p_data) <> 'object' or pg_column_size(p_data) > 32768 then
    raise exception 'Invalid record data' using errcode = '22023';
  end if;
  begin new_department := nullif(p_data ->> 'department_id', '')::uuid;
  exception when invalid_text_representation then raise exception 'Choose a valid department' using errcode = '22023'; end;
  if new_department is null or not exists (select 1 from core.departments where id = new_department and is_active) then
    raise exception 'Choose an active department' using errcode = '22023';
  end if;

  dataset_slug := case p_module
    when 'jobseekers' then 'jobseeker_registry'
    when 'research' then 'research_requests'
    when 'biometrics' then 'biometric_events'
  end;
  if dataset_slug is null then raise exception 'Unknown database' using errcode = '22023'; end if;
  select id into dataset_id from core.datasets where slug = dataset_slug and is_active;
  if dataset_id is null then raise exception 'Database is unavailable' using errcode = '22023'; end if;

  if p_module = 'jobseekers' then
    select department_id, version into old_department, current_version
    from jobseekers.people where id = p_record_id and archived_at is null for update;
  elsif p_module = 'research' then
    select department_id, version into old_department, current_version
    from research.requests where id = p_record_id and archived_at is null for update;
  else
    select department_id, version into old_department, current_version
    from biometrics.device_events where id = p_record_id for update;
  end if;
  if not found then raise exception 'Record not found' using errcode = 'P0002'; end if;
  if not core.can_access_dataset(dataset_slug, 'read_write', old_department)
     or not core.can_access_dataset(dataset_slug, 'read_write', new_department) then
    raise exception 'Read/write access is required for both departments' using errcode = '42501';
  end if;
  if current_version <> p_version then
    raise exception 'Record changed while editing' using errcode = '40001';
  end if;

  if p_module = 'jobseekers' then
    if length(trim(coalesce(p_data->>'first_name', ''))) not between 1 and 120
       or length(trim(coalesce(p_data->>'surname', ''))) not between 1 and 120 then
      raise exception 'First name and surname are required' using errcode = '22023';
    end if;
    if p_data ? 'metadata' and jsonb_typeof(p_data->'metadata') <> 'object' then
      raise exception 'Invalid source details' using errcode = '22023';
    end if;
    update jobseekers.people
    set department_id = new_department,
        source_person_id = nullif(trim(p_data->>'source_person_id'), ''),
        first_name = trim(p_data->>'first_name'),
        middle_name = nullif(trim(p_data->>'middle_name'), ''),
        surname = trim(p_data->>'surname'),
        suffix = nullif(trim(p_data->>'suffix'), ''),
        birth_date = nullif(p_data->>'birth_date', '')::date,
        sex = nullif(trim(p_data->>'sex'), ''),
        email = nullif(trim(p_data->>'email'), ''),
        mobile_number = nullif(trim(p_data->>'mobile_number'), ''),
        metadata = metadata || coalesce(p_data->'metadata', '{}'::jsonb)
          || jsonb_build_object(
            'EMPLOYMENT STATUS', nullif(trim(p_data->>'employment_status'), ''),
            'HIGHEST EDUCATIONAL ATTAINMENT', nullif(trim(p_data->>'highest_education'), ''),
            'PREFERRED CCUPATION/S', nullif(trim(p_data->>'preferred_occupation'), '')
          ),
        updated_by = auth.uid(), updated_at = now(), version = version + 1
    where id = p_record_id;
    select concat_ws(' ', first_name, middle_name, surname) into record_label
    from jobseekers.people where id = p_record_id;
  elsif p_module = 'research' then
    if length(trim(coalesce(p_data->>'requester_name', ''))) not between 2 and 160
       or length(trim(coalesce(p_data->>'research_title_purpose', ''))) not between 2 and 1000 then
      raise exception 'Requester and research title or purpose are required' using errcode = '22023';
    end if;
    update research.requests
    set department_id = new_department,
        category = nullif(trim(p_data->>'category'), ''),
        requester_name = trim(p_data->>'requester_name'),
        institution_office = nullif(trim(p_data->>'institution_office'), ''),
        research_title_purpose = trim(p_data->>'research_title_purpose'),
        control_number = nullif(trim(p_data->>'control_number'), ''),
        date_received = nullif(p_data->>'date_received', '')::date,
        status = coalesce(nullif(p_data->>'status', '')::research.request_status, 'received'),
        decision_notes = nullif(trim(p_data->>'decision_notes'), ''),
        updated_by = auth.uid(), updated_at = now(), version = version + 1
    where id = p_record_id;
    select requester_name into record_label from research.requests where id = p_record_id;
  else
    if length(trim(coalesce(p_data->>'person_name', ''))) not between 2 and 160
       or length(trim(coalesce(p_data->>'personnel_number', ''))) not between 1 and 80
       or nullif(p_data->>'occurred_at', '') is null then
      raise exception 'Name, personnel number, and date/time are required' using errcode = '22023';
    end if;
    update biometrics.device_events
    set department_id = new_department,
        subject_id = case when old_department is distinct from new_department
                               or personnel_number is distinct from trim(p_data->>'personnel_number')
                               or person_name is distinct from trim(p_data->>'person_name')
                          then null else subject_id end,
        location_id = case when old_department is distinct from new_department
                               or external_location_id is distinct from nullif(trim(p_data->>'external_location_id'), '')
                          then null else location_id end,
        personnel_number = trim(p_data->>'personnel_number'),
        person_name = trim(p_data->>'person_name'),
        occurred_at = (p_data->>'occurred_at')::timestamptz,
        attendance_status = nullif(trim(p_data->>'attendance_status'), ''),
        external_location_id = nullif(trim(p_data->>'external_location_id'), ''),
        employment_id_number = nullif(trim(p_data->>'employment_id_number'), ''),
        workcode = nullif(trim(p_data->>'workcode'), ''),
        verify_code = nullif(trim(p_data->>'verify_code'), ''),
        card_number = nullif(trim(p_data->>'card_number'), ''),
        updated_by = auth.uid(), updated_at = now(), version = version + 1
    where id = p_record_id;
    select person_name into record_label from biometrics.device_events where id = p_record_id;
  end if;

  insert into core.audit_events (actor_id, dataset_id, action, target_type, target_id, summary, metadata)
  values (auth.uid(), dataset_id, 'record.updated', 'record', p_record_id::text,
          'Record edited', jsonb_build_object('module', p_module, 'label', record_label,
                                              'old_department_id', old_department,
                                              'department_id', new_department,
                                              'version', p_version + 1));
  return p_record_id;
exception
  when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Enter a valid date and time' using errcode = '22007';
  when string_data_right_truncation then
    raise exception 'One or more values are too long' using errcode = '22001';
end;
$$;

revoke all on function core.update_manual_record(text, uuid, integer, jsonb) from public;
grant execute on function core.update_manual_record(text, uuid, integer, jsonb) to authenticated;

-- All edits to these record tables go through the audited function.
revoke update on jobseekers.people, research.requests, biometrics.device_events from authenticated;

commit;
