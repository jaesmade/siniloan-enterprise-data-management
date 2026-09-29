-- Preserve research request type through imports, reviewed submissions, and edits.
-- Existing imported rows used the default type even when the source category was Interview Request.
WITH corrected AS (
  UPDATE research.requests
  SET request_type = 'interview_request', updated_at = now(), version = version + 1
  WHERE source_row_number IS NOT NULL
    AND lower(trim(coalesce(category, ''))) = 'interview request'
    AND request_type = 'data_request'
  RETURNING id
)
INSERT INTO core.audit_events(dataset_id, action, target_type, target_id, summary, metadata)
SELECT d.id, 'record.request_type_corrected', 'record', c.id::text,
       'Imported interview request type corrected',
       jsonb_build_object('previous_request_type', 'data_request', 'request_type', 'interview_request')
FROM corrected c CROSS JOIN core.datasets d
WHERE d.slug = 'research_requests';

CREATE OR REPLACE FUNCTION core.review_data_submission(p_submission_id uuid, p_decision text, p_feedback text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s core.data_submissions%rowtype; slug text; job uuid; accepted integer; rec jsonb; target_department uuid;
BEGIN
 IF NOT core.is_active_admin('dpo') THEN RAISE EXCEPTION 'DPO authorization required' USING errcode='42501'; END IF;
 IF p_decision NOT IN ('approve','return','reject') THEN RAISE EXCEPTION 'Choose approve, return, or reject' USING errcode='22023'; END IF;
 SELECT * INTO s FROM core.data_submissions WHERE id=p_submission_id FOR UPDATE;
 IF s.id IS NULL OR s.status<>'pending_review' THEN RAISE EXCEPTION 'Submission is no longer awaiting review' USING errcode='40001'; END IF;
 SELECT d.slug INTO slug FROM core.datasets d WHERE d.id=s.dataset_id;
 IF p_decision='approve' THEN
  IF s.submission_type='import' THEN
   SELECT id INTO job FROM core.import_jobs WHERE id=s.import_job_id;
   IF job IS NULL THEN
    INSERT INTO core.import_jobs(dataset_id,requested_by,status,source_filename,mapping_version,total_rows,started_at)
    VALUES(s.dataset_id,auth.uid(),'processing',coalesce(s.source_filename,'approved submission'),'reviewed-mapping-v1',s.total_rows,now()) RETURNING id INTO job;
   END IF;
  END IF;
  FOR rec IN SELECT value FROM jsonb_array_elements(s.payload) LOOP
   target_department := nullif(rec->>'department_id','')::uuid;
   IF slug='jobseeker_registry' THEN
    INSERT INTO jobseekers.people(department_id,source_person_id,surname,first_name,middle_name,suffix,birth_date,sex,email,mobile_number,metadata,import_job_id,source_row_number,created_by,updated_by)
    VALUES(target_department,rec->>'source_person_id',rec->>'surname',rec->>'first_name',nullif(rec->>'middle_name',''),nullif(rec->>'suffix',''),nullif(rec->>'birth_date','')::date,nullif(rec->>'sex',''),nullif(rec->>'email',''),nullif(rec->>'mobile_number',''),coalesce(rec->'metadata','{}'::jsonb),job,nullif(rec->>'source_row_number','')::integer,s.submitted_by,s.submitted_by);
   ELSIF slug='research_requests' THEN
    INSERT INTO research.requests(department_id,submitted_at,request_type,category,requester_name,institution_office,research_title_purpose,control_number,date_received,status,decision_notes,import_job_id,source_row_number,created_by,updated_by)
    VALUES(target_department,coalesce(nullif(rec->>'submitted_at','')::timestamptz,now()),CASE WHEN rec->>'request_type' IN ('data_request','interview_request') THEN rec->>'request_type' WHEN lower(trim(coalesce(rec->>'category','')))='interview request' THEN 'interview_request' ELSE 'data_request' END,nullif(rec->>'category',''),rec->>'requester_name',nullif(rec->>'institution_office',''),rec->>'research_title_purpose',nullif(rec->>'control_number',''),nullif(rec->>'date_received','')::date,'received',nullif(rec->>'decision_notes',''),job,nullif(rec->>'source_row_number','')::integer,s.submitted_by,s.submitted_by);
   ELSIF slug='biometric_events' THEN
    INSERT INTO biometrics.device_events(department_id,personnel_number,person_name,occurred_at,attendance_status,external_location_id,employment_id_number,workcode,verify_code,card_number,raw_source,import_job_id,source_row_number,created_by)
    VALUES(target_department,rec->>'personnel_number',rec->>'person_name',(rec->>'occurred_at')::timestamptz,nullif(rec->>'attendance_status',''),nullif(rec->>'external_location_id',''),nullif(rec->>'employment_id_number',''),nullif(rec->>'workcode',''),nullif(rec->>'verify_code',''),nullif(rec->>'card_number',''),coalesce(rec->'raw_source','{}'::jsonb),job,nullif(rec->>'source_row_number','')::integer,s.submitted_by);
   ELSE RAISE EXCEPTION 'Unknown dataset'; END IF;
   accepted := coalesce(accepted,0)+1;
  END LOOP;
  IF job IS NOT NULL THEN
   UPDATE core.import_jobs SET status='completed',processed_rows=accepted,accepted_rows=accepted,rejected_rows=0,completed_at=now() WHERE id=job;
  END IF;
 END IF;
 UPDATE core.data_submissions SET status=CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'return' THEN 'returned' ELSE 'rejected' END,
 reviewer_id=auth.uid(),reviewer_feedback=nullif(left(trim(coalesce(p_feedback,'')),1000),''),reviewed_at=now(),import_job_id=job,committed_rows=accepted,revision=revision+CASE WHEN p_decision='return' THEN 1 ELSE 0 END
 WHERE id=s.id;
 INSERT INTO core.audit_events(actor_id,dataset_id,action,target_type,target_id,summary,metadata)
 VALUES(auth.uid(),s.dataset_id,'submission.'||p_decision,'data_submission',s.id::text,'DPO reviewed data submission',jsonb_build_object('submitter',s.submitted_by,'rows',s.total_rows,'feedback',left(coalesce(p_feedback,''),300)));
 RETURN jsonb_build_object('id',s.id,'status',CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'return' THEN 'returned' ELSE 'rejected' END,'accepted',coalesce(accepted,0));
END; $$;

CREATE OR REPLACE FUNCTION core.stage_manual_submission(p_module text,p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE slug text; item jsonb; metadata jsonb;
BEGIN
 IF p_module NOT IN ('jobseekers','research','biometrics') THEN RAISE EXCEPTION 'Unknown database'; END IF;
 slug := CASE p_module WHEN 'jobseekers' THEN 'jobseeker_registry' WHEN 'research' THEN 'research_requests' ELSE 'biometric_events' END;
 IF NOT core.can_submit_dataset(slug,nullif(p_data->>'department_id','')::uuid) THEN RAISE EXCEPTION 'Assigned dataset submission access required' USING errcode='42501'; END IF;
 IF p_module='jobseekers' THEN
  metadata:=coalesce(p_data->'metadata','{}'::jsonb)||jsonb_build_object('EMPLOYMENT STATUS',nullif(p_data->>'employment_status',''),'HIGHEST EDUCATIONAL ATTAINMENT',nullif(p_data->>'highest_education',''),'PREFERRED CCUPATION/S',nullif(p_data->>'preferred_occupation',''),'ENTRY METHOD','Manual');
  item:=jsonb_build_object('department_id',p_data->>'department_id','source_person_id',p_data->>'source_person_id','surname',p_data->>'surname','first_name',p_data->>'first_name','middle_name',p_data->>'middle_name','suffix',p_data->>'suffix','birth_date',p_data->>'birth_date','sex',p_data->>'sex','email',p_data->>'email','mobile_number',p_data->>'mobile_number','metadata',metadata);
 ELSIF p_module='research' THEN
  IF coalesce(p_data->>'request_type','') NOT IN ('data_request','interview_request') THEN RAISE EXCEPTION 'Choose a request type' USING errcode='22023'; END IF;
  item:=jsonb_build_object('department_id',p_data->>'department_id','submitted_at',now(),'request_type',p_data->>'request_type','category',p_data->>'category','requester_name',p_data->>'requester_name','institution_office',p_data->>'institution_office','research_title_purpose',p_data->>'research_title_purpose','date_received',p_data->>'date_received','status','received');
 ELSE
  item:=jsonb_build_object('department_id',p_data->>'department_id','personnel_number',p_data->>'personnel_number','person_name',p_data->>'person_name','occurred_at',p_data->>'occurred_at','attendance_status',p_data->>'attendance_status','external_location_id',p_data->>'external_location_id','employment_id_number',p_data->>'employment_id_number','workcode',p_data->>'workcode','verify_code',p_data->>'verify_code','card_number',p_data->>'card_number','raw_source',jsonb_build_object('ENTRY METHOD','Manual'));
 END IF;
 RETURN core.submit_data_submission(slug,'manual',jsonb_build_array(item),NULL);
END; $$;

create or replace function core.update_manual_record(
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
    if coalesce(p_data->>'request_type', '') not in ('data_request', 'interview_request') then
      raise exception 'Choose a request type' using errcode = '22023';
    end if;
    update research.requests
    set department_id = new_department,
        request_type = p_data->>'request_type',
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

