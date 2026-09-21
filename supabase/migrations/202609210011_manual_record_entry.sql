begin;

create or replace function core.create_manual_record(p_module text, p_data jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  dataset_slug text;
  dataset_id uuid;
  department_id uuid;
  record_id uuid;
  record_label text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_data) <> 'object' or pg_column_size(p_data) > 32768 then
    raise exception 'Invalid record data' using errcode = '22023';
  end if;
  begin department_id := nullif(p_data ->> 'department_id', '')::uuid;
  exception when invalid_text_representation then raise exception 'Choose a valid department' using errcode = '22023'; end;
  if department_id is null or not exists (select 1 from core.departments d where d.id=department_id and d.is_active) then
    raise exception 'Choose an active department' using errcode = '22023';
  end if;

  dataset_slug := case p_module when 'jobseekers' then 'jobseeker_registry' when 'research' then 'research_requests' when 'biometrics' then 'biometric_events' end;
  if dataset_slug is null then raise exception 'Unknown database' using errcode = '22023'; end if;
  if not core.can_access_dataset(dataset_slug, 'read_write', department_id) then
    raise exception 'Read/write access is required for this department' using errcode = '42501';
  end if;
  select id into dataset_id from core.datasets where slug=dataset_slug and is_active;

  if p_module = 'jobseekers' then
    if length(trim(coalesce(p_data->>'first_name',''))) not between 1 and 120 or length(trim(coalesce(p_data->>'surname',''))) not between 1 and 120 then
      raise exception 'First name and surname are required' using errcode = '22023';
    end if;
    insert into jobseekers.people
      (department_id,source_person_id,surname,first_name,middle_name,suffix,birth_date,sex,email,mobile_number,metadata,created_by,updated_by)
    values
      (department_id,nullif(trim(p_data->>'source_person_id'),''),trim(p_data->>'surname'),trim(p_data->>'first_name'),nullif(trim(p_data->>'middle_name'),''),nullif(trim(p_data->>'suffix'),''),nullif(p_data->>'birth_date','')::date,nullif(trim(p_data->>'sex'),''),nullif(trim(p_data->>'email'),''),nullif(trim(p_data->>'mobile_number'),''),
       jsonb_build_object('EMPLOYMENT STATUS',nullif(trim(p_data->>'employment_status'),''),'PREFERRED CCUPATION/S',nullif(trim(p_data->>'preferred_occupation'),''),'ENTRY METHOD','Manual'),auth.uid(),auth.uid())
    returning id, concat_ws(' ',first_name,middle_name,surname) into record_id,record_label;
  elsif p_module = 'research' then
    if length(trim(coalesce(p_data->>'requester_name',''))) not between 2 and 160 or length(trim(coalesce(p_data->>'research_title_purpose',''))) not between 2 and 1000 then
      raise exception 'Requester and research title or purpose are required' using errcode = '22023';
    end if;
    insert into research.requests
      (department_id,submitted_at,category,requester_name,institution_office,research_title_purpose,control_number,date_received,status,decision_notes,created_by,updated_by)
    values
      (department_id,coalesce(nullif(p_data->>'submitted_at','')::timestamptz,now()),nullif(trim(p_data->>'category'),''),trim(p_data->>'requester_name'),nullif(trim(p_data->>'institution_office'),''),trim(p_data->>'research_title_purpose'),nullif(trim(p_data->>'control_number'),''),nullif(p_data->>'date_received','')::date,coalesce(nullif(p_data->>'status','')::research.request_status,'received'),nullif(trim(p_data->>'decision_notes'),''),auth.uid(),auth.uid())
    returning id, requester_name into record_id,record_label;
  else
    if length(trim(coalesce(p_data->>'person_name',''))) not between 2 and 160 or length(trim(coalesce(p_data->>'personnel_number',''))) not between 1 and 80 or nullif(p_data->>'occurred_at','') is null then
      raise exception 'Name, personnel number, and date/time are required' using errcode = '22023';
    end if;
    insert into biometrics.device_events
      (department_id,personnel_number,person_name,occurred_at,attendance_status,external_location_id,employment_id_number,workcode,verify_code,card_number,raw_source,created_by)
    values
      (department_id,trim(p_data->>'personnel_number'),trim(p_data->>'person_name'),(p_data->>'occurred_at')::timestamptz,nullif(trim(p_data->>'attendance_status'),''),nullif(trim(p_data->>'external_location_id'),''),nullif(trim(p_data->>'employment_id_number'),''),nullif(trim(p_data->>'workcode'),''),nullif(trim(p_data->>'verify_code'),''),nullif(trim(p_data->>'card_number'),''),jsonb_build_object('ENTRY METHOD','Manual'),auth.uid())
    returning id,person_name into record_id,record_label;
  end if;

  insert into core.audit_events (actor_id,dataset_id,action,target_type,target_id,summary,metadata)
  values (auth.uid(),dataset_id,'record.created','record',record_id::text,'Record added manually',jsonb_build_object('module',p_module,'label',record_label,'department_id',department_id));
  return record_id;
exception
  when invalid_datetime_format or datetime_field_overflow then raise exception 'Enter a valid date and time' using errcode = '22007';
  when string_data_right_truncation then raise exception 'One or more values are too long' using errcode = '22001';
end;
$$;

revoke all on function core.create_manual_record(text,jsonb) from public;
grant execute on function core.create_manual_record(text,jsonb) to authenticated;

commit;
