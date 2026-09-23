-- Introduce explicit operator and submitter roles, with all focalperson work reviewed before publication.
-- Reclassify existing accounts before installing the restrictive policies below.
UPDATE core.profiles SET role = 'system_admin', updated_at = now() WHERE role = 'dpo';
UPDATE core.profiles SET role = 'office_focal', updated_at = now() WHERE role = 'data_steward';

CREATE TABLE core.data_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES core.datasets(id),
  submitted_by uuid NOT NULL REFERENCES core.profiles(id),
  submission_type text NOT NULL CHECK (submission_type IN ('manual', 'import', 'guest_request')),
  source_filename text,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'array' AND jsonb_array_length(payload) BETWEEN 1 AND 25000),
  total_rows integer NOT NULL CHECK (total_rows > 0),
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'returned', 'rejected')),
  reviewer_id uuid REFERENCES core.profiles(id),
  reviewer_feedback text,
  reviewed_at timestamptz,
  import_job_id uuid REFERENCES core.import_jobs(id),
  committed_rows integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);
CREATE INDEX data_submissions_review_idx ON core.data_submissions(status, created_at) WHERE status = 'pending_review';
ALTER TABLE core.data_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY data_submissions_dpo_all ON core.data_submissions FOR ALL TO authenticated USING (core.is_active_admin('dpo')) WITH CHECK (core.is_active_admin('dpo'));

CREATE OR REPLACE FUNCTION core.is_active_admin(required_role core.app_role DEFAULT 'data_steward')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
  SELECT 1 FROM core.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
   AND ((required_role = 'dpo' AND p.role = 'dpo')
     OR (required_role <> 'dpo' AND p.role IN ('dpo','system_admin')))
 );
$$;

CREATE OR REPLACE FUNCTION core.can_access_dataset(dataset_slug text, required_access core.access_mode DEFAULT 'read_only', row_department uuid DEFAULT null)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS 
$$
 SELECT EXISTS (
  SELECT 1 FROM core.profiles p JOIN core.datasets d ON d.slug=dataset_slug AND d.is_active
  WHERE p.id=auth.uid() AND p.status='active' AND p.role='dpo'
 );
$$
;

CREATE OR REPLACE FUNCTION core.can_submit_dataset(dataset_slug text, row_department uuid DEFAULT null)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
  SELECT 1 FROM core.profiles p JOIN core.datasets d ON d.slug=dataset_slug AND d.is_active
  JOIN core.user_dataset_grants g ON g.user_id=p.id AND g.dataset_id=d.id AND g.revoked_at IS NULL AND g.access_mode='read_write'
  WHERE p.id=auth.uid() AND p.status='active' AND p.role='office_focal'
   AND (g.department_scope_id IS NULL OR g.department_scope_id=row_department)
 );
$$;

-- Existing broad policies call can_access_dataset, which now permits only DPO record access.
DROP POLICY IF EXISTS profiles_read_self_or_dpo ON core.profiles;
CREATE POLICY profiles_read_self_or_admin ON core.profiles FOR SELECT TO authenticated
 USING (id=auth.uid() OR core.is_active_admin('data_steward'));
DROP POLICY IF EXISTS audit_read ON core.audit_events;
CREATE POLICY audit_read ON core.audit_events FOR SELECT TO authenticated
 USING (core.is_active_admin('data_steward') OR (dataset_id IS NOT NULL AND EXISTS (SELECT 1 FROM core.datasets d WHERE d.id=dataset_id AND core.can_access_dataset(d.slug))));
DROP POLICY IF EXISTS datasets_read ON core.datasets;
CREATE POLICY datasets_read ON core.datasets FOR SELECT TO authenticated USING (core.is_active_admin('data_steward') OR core.can_access_dataset(slug) OR EXISTS(SELECT 1 FROM core.user_dataset_grants g WHERE g.user_id=auth.uid() AND g.dataset_id=core.datasets.id AND g.revoked_at IS NULL AND g.access_mode='read_write'));
DROP POLICY IF EXISTS grants_read_self_or_dpo ON core.user_dataset_grants;
CREATE POLICY grants_read_self_or_admin ON core.user_dataset_grants FOR SELECT TO authenticated USING (user_id=auth.uid() OR core.is_active_admin('data_steward'));
DROP POLICY IF EXISTS grants_manage_dpo ON core.user_dataset_grants;
CREATE POLICY grants_manage_dpo ON core.user_dataset_grants FOR ALL TO authenticated USING (core.is_active_admin('dpo')) WITH CHECK (core.is_active_admin('dpo'));
DROP POLICY IF EXISTS decisions_read_dpo ON core.account_decisions;
CREATE POLICY decisions_read_dpo ON core.account_decisions FOR SELECT TO authenticated USING (core.is_active_admin('data_steward'));
DROP POLICY IF EXISTS decisions_manage_dpo ON core.account_decisions;
CREATE POLICY decisions_manage_dpo ON core.account_decisions FOR ALL TO authenticated USING (core.is_active_admin('dpo')) WITH CHECK (core.is_active_admin('dpo'));
DROP POLICY IF EXISTS imports_read ON core.import_jobs;
CREATE POLICY imports_read ON core.import_jobs FOR SELECT TO authenticated USING (core.is_active_admin('dpo'));
DROP POLICY IF EXISTS import_errors_read ON core.import_row_errors;
CREATE POLICY import_errors_read ON core.import_row_errors FOR SELECT TO authenticated USING (core.is_active_admin('dpo'));

CREATE OR REPLACE FUNCTION core.submit_data_submission(p_dataset_slug text, p_type text, p_payload jsonb, p_filename text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE did uuid; dep uuid; submission_id uuid; rows_count integer;
BEGIN
 IF p_type NOT IN ('manual','import') OR jsonb_typeof(p_payload)<>'array' THEN RAISE EXCEPTION 'Invalid submission' USING errcode='22023'; END IF;
 rows_count := jsonb_array_length(p_payload);
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload) r WHERE NOT core.can_submit_dataset(p_dataset_slug,nullif(r->>'department_id','')::uuid)) THEN
  RAISE EXCEPTION 'The submission includes a department outside your assigned scope' USING errcode='42501';
 END IF;
 IF rows_count<1 OR rows_count>25000 OR pg_column_size(p_payload)>52428800 THEN RAISE EXCEPTION 'Submission is outside the allowed size' USING errcode='22023'; END IF;
 SELECT id INTO did FROM core.datasets WHERE slug=p_dataset_slug AND is_active;
 IF did IS NULL OR NOT EXISTS(SELECT 1 FROM core.user_dataset_grants g WHERE g.user_id=auth.uid() AND g.dataset_id=did AND g.revoked_at IS NULL AND g.access_mode='read_write') THEN RAISE EXCEPTION 'Assigned dataset submission access required' USING errcode='42501'; END IF;
 SELECT department_id INTO dep FROM core.profiles WHERE id=auth.uid();
 IF p_dataset_slug='jobseeker_registry' THEN
  INSERT INTO core.data_submissions(dataset_id,submitted_by,submission_type,source_filename,payload,total_rows)
  VALUES(did,auth.uid(),p_type,p_filename,p_payload,rows_count) RETURNING id INTO submission_id;
 ELSE
  INSERT INTO core.data_submissions(dataset_id,submitted_by,submission_type,source_filename,payload,total_rows)
  VALUES(did,auth.uid(),p_type,p_filename,p_payload,rows_count) RETURNING id INTO submission_id;
 END IF;
 INSERT INTO core.audit_events(actor_id,dataset_id,action,target_type,target_id,summary,metadata)
 VALUES(auth.uid(),did,'submission.pending_review','data_submission',submission_id::text,'Data submission sent for DPO review',jsonb_build_object('submission_type',p_type,'total_rows',rows_count,'filename',p_filename));
 RETURN submission_id;
END; $$;

CREATE OR REPLACE FUNCTION core.my_data_submissions()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'dataset',d.name,'type',s.submission_type,'filename',s.source_filename,'rows',s.total_rows,'status',s.status,'feedback',s.reviewer_feedback,'created_at',s.created_at,'reviewed_at',s.reviewed_at) ORDER BY s.created_at DESC),'[]'::jsonb)
 FROM core.data_submissions s JOIN core.datasets d ON d.id=s.dataset_id WHERE s.submitted_by=auth.uid()
 AND EXISTS (SELECT 1 FROM core.profiles p WHERE p.id=auth.uid() AND p.role='office_focal' AND p.status='active');
$$;

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
    INSERT INTO research.requests(department_id,submitted_at,category,requester_name,institution_office,research_title_purpose,control_number,date_received,status,decision_notes,import_job_id,source_row_number,created_by,updated_by)
    VALUES(target_department,coalesce(nullif(rec->>'submitted_at','')::timestamptz,now()),nullif(rec->>'category',''),rec->>'requester_name',nullif(rec->>'institution_office',''),rec->>'research_title_purpose',nullif(rec->>'control_number',''),nullif(rec->>'date_received','')::date,'received',nullif(rec->>'decision_notes',''),job,nullif(rec->>'source_row_number','')::integer,s.submitted_by,s.submitted_by);
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

-- Research control numbers are generated atomically by the database.
ALTER TABLE research.requests ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'data_request' CHECK (request_type IN ('data_request','interview_request'));
ALTER TABLE research.requests ADD COLUMN IF NOT EXISTS original_control_number text;
CREATE TABLE IF NOT EXISTS research.control_number_counters (year integer PRIMARY KEY, last_value integer NOT NULL DEFAULT 0);
INSERT INTO research.control_number_counters(year,last_value)
SELECT substring(control_number from 5 for 4)::integer, max(substring(control_number from 10)::integer)
FROM research.requests WHERE control_number ~ '^REQ-[0-9]{4}-[0-9]{6}$' GROUP BY 1
ON CONFLICT(year) DO UPDATE SET last_value=greatest(research.control_number_counters.last_value,excluded.last_value);
CREATE OR REPLACE FUNCTION research.assign_control_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE y integer := extract(year FROM coalesce(NEW.submitted_at,now()))::integer; n integer;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.control_number IS NOT NULL AND NEW.original_control_number IS NULL THEN NEW.original_control_number:=NEW.control_number; END IF;
  INSERT INTO research.control_number_counters(year,last_value) VALUES(y,1)
  ON CONFLICT(year) DO UPDATE SET last_value=research.control_number_counters.last_value+1 RETURNING last_value INTO n;
  NEW.control_number:=format('REQ-%s-%s',y,lpad(n::text,6,'0'));
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS research_control_number_assign ON research.requests;
CREATE TRIGGER research_control_number_assign BEFORE INSERT ON research.requests FOR EACH ROW EXECUTE FUNCTION research.assign_control_number();
CREATE UNIQUE INDEX IF NOT EXISTS research_control_number_unique ON research.requests(lower(control_number)) WHERE control_number IS NOT NULL;

-- Allow System Administrators to manage accounts; DPOs retain dataset-account review.
CREATE OR REPLACE FUNCTION core.update_account_access(target_user_id uuid,updated_department_id uuid,updated_role core.app_role,dataset_grants jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_profile core.profiles%rowtype; grant_item jsonb; target_dataset_id uuid; requested_mode core.access_mode; actor_role core.app_role;
BEGIN
 SELECT role INTO actor_role FROM core.profiles WHERE id=auth.uid() AND status='active';
 IF actor_role NOT IN ('dpo','system_admin') THEN RAISE EXCEPTION 'Account management authority required' USING errcode='42501'; END IF;
 IF updated_role NOT IN ('dpo','office_focal','staff') THEN RAISE EXCEPTION 'Role is not assignable' USING errcode='22023'; END IF;
 IF updated_role='dpo' AND NOT EXISTS(SELECT 1 FROM core.profiles WHERE id=auth.uid() AND role='system_admin' AND status='active') THEN RAISE EXCEPTION 'Only System Administrators can assign DPO authority' USING errcode='42501'; END IF;
 SELECT * INTO target_profile FROM core.profiles WHERE id=target_user_id AND status='active' FOR UPDATE;
 IF target_profile.id IS NULL THEN RAISE EXCEPTION 'Active account not found' USING errcode='P0002'; END IF;
 IF target_profile.role='system_admin' THEN RAISE EXCEPTION 'System Administrator accounts cannot be edited here' USING errcode='42501'; END IF;
 IF actor_role='dpo' AND target_profile.role='dpo' THEN RAISE EXCEPTION 'DPOs cannot manage other DPO accounts' USING errcode='42501'; END IF;
 IF updated_role<>'office_focal' AND jsonb_array_length(coalesce(dataset_grants,'[]'::jsonb))>0 THEN RAISE EXCEPTION 'Only Office Focalpersons may have submission assignments'; END IF;
 PERFORM 1 FROM core.departments WHERE id=updated_department_id AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active department required'; END IF;
 UPDATE core.profiles SET department_id=updated_department_id,role=updated_role,updated_at=now() WHERE id=target_user_id;
 UPDATE core.user_dataset_grants SET revoked_at=now() WHERE user_id=target_user_id AND revoked_at IS NULL;
 FOR grant_item IN SELECT value FROM jsonb_array_elements(coalesce(dataset_grants,'[]'::jsonb)) LOOP
  SELECT id INTO target_dataset_id FROM core.datasets WHERE slug=grant_item->>'dataset_slug' AND is_active;
  IF target_dataset_id IS NULL THEN RAISE EXCEPTION 'Unknown dataset'; END IF;
  requested_mode := coalesce((grant_item->>'access_mode')::core.access_mode,'read_write');
  IF requested_mode<>'read_write' THEN RAISE EXCEPTION 'Office Focalperson assignments are submission only'; END IF;
  INSERT INTO core.user_dataset_grants(user_id,dataset_id,access_mode,department_scope_id,granted_by)
  VALUES(target_user_id,target_dataset_id,requested_mode,nullif(grant_item->>'department_scope_id','')::uuid,auth.uid());
 END LOOP;
 INSERT INTO core.audit_events(actor_id,action,target_type,target_id,summary,metadata)
 VALUES(auth.uid(),'account.access_updated','profile',target_user_id::text,'Account role, department, or dataset access updated',jsonb_build_object('previous_role',target_profile.role,'updated_role',updated_role,'department_id',updated_department_id));
END; $$;

CREATE OR REPLACE FUNCTION core.system_dashboard_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM core.profiles WHERE id=auth.uid() AND role='system_admin' AND status='active') THEN RAISE EXCEPTION 'System Administrator access required' USING errcode='42501'; END IF;
 RETURN jsonb_build_object(
  'jobseekers',(SELECT count(*) FROM jobseekers.people WHERE archived_at IS NULL),
  'research',(SELECT count(*) FROM research.requests WHERE archived_at IS NULL),
  'biometrics',(SELECT count(*) FROM biometrics.device_events),
  'pending_accounts',(SELECT count(*) FROM core.profiles WHERE status='pending'),
  'recent_events',(SELECT coalesce(jsonb_agg(jsonb_build_object('action',action,'summary',summary,'occurred_at',occurred_at) ORDER BY occurred_at DESC),'[]'::jsonb) FROM (SELECT action,summary,occurred_at FROM core.audit_events WHERE dataset_id IS NULL AND (action LIKE 'auth.%' OR action LIKE 'account.%') ORDER BY occurred_at DESC LIMIT 8) e)
 );
END; $$;

GRANT EXECUTE ON FUNCTION core.can_submit_dataset(text,uuid), core.submit_data_submission(text,text,jsonb,text), core.my_data_submissions(), core.review_data_submission(uuid,text,text), core.system_dashboard_stats() TO authenticated;
REVOKE ALL ON FUNCTION core.submit_data_submission(text,text,jsonb,text), core.review_data_submission(uuid,text,text), core.system_dashboard_stats() FROM public;
CREATE OR REPLACE FUNCTION core.approve_account(applicant_id uuid, approved_department_id uuid, approved_role core.app_role, dataset_grants jsonb, decision_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE grant_item jsonb; did uuid; mode core.access_mode; scope uuid; actor_role core.app_role;
BEGIN
 SELECT role INTO actor_role FROM core.profiles WHERE id=auth.uid() AND status='active';
 IF actor_role NOT IN ('dpo','system_admin') THEN RAISE EXCEPTION 'Account management authority required' USING errcode='42501'; END IF;
 IF approved_role='system_admin' OR approved_role='data_steward' THEN RAISE EXCEPTION 'This role cannot be assigned' USING errcode='22023'; END IF;
 IF approved_role='dpo' AND actor_role<>'system_admin' THEN RAISE EXCEPTION 'Only System Administrators can assign DPO authority' USING errcode='42501'; END IF;
 IF approved_role<>'office_focal' AND jsonb_array_length(coalesce(dataset_grants,'[]'::jsonb))>0 THEN RAISE EXCEPTION 'Only Office Focalpersons may have submission assignments'; END IF;
 PERFORM 1 FROM core.departments WHERE id=approved_department_id AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active department required'; END IF;
 PERFORM 1 FROM core.profiles WHERE id=applicant_id AND status IN ('pending','active') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Applicant not found' USING errcode='P0002'; END IF;
 UPDATE core.profiles SET status='active',department_id=approved_department_id,role=approved_role,approved_by=auth.uid(),approved_at=now(),updated_at=now() WHERE id=applicant_id;
 UPDATE core.user_dataset_grants SET revoked_at=now() WHERE user_id=applicant_id AND revoked_at IS NULL;
 FOR grant_item IN SELECT value FROM jsonb_array_elements(coalesce(dataset_grants,'[]'::jsonb)) LOOP
  SELECT id INTO did FROM core.datasets WHERE slug=grant_item->>'dataset_slug' AND is_active;
  IF did IS NULL THEN RAISE EXCEPTION 'Unknown dataset'; END IF;
  mode := coalesce((grant_item->>'access_mode')::core.access_mode,'read_write');
  IF mode<>'read_write' THEN RAISE EXCEPTION 'Office Focalperson assignments are submission only'; END IF;
  scope := nullif(grant_item->>'department_scope_id','')::uuid;
  INSERT INTO core.user_dataset_grants(user_id,dataset_id,access_mode,department_scope_id,granted_by) VALUES(applicant_id,did,mode,scope,auth.uid());
 END LOOP;
 INSERT INTO core.account_decisions(profile_id,decision,decided_by,reason) VALUES(applicant_id,'active',auth.uid(),decision_reason);
 INSERT INTO core.audit_events(actor_id,action,target_type,target_id,summary,metadata) VALUES(auth.uid(),'account.approved','profile',applicant_id::text,'Account activated and assigned a role',jsonb_build_object('role',approved_role,'department_id',approved_department_id,'reason',decision_reason));
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
  item:=jsonb_build_object('department_id',p_data->>'department_id','submitted_at',now(),'category',p_data->>'category','requester_name',p_data->>'requester_name','institution_office',p_data->>'institution_office','research_title_purpose',p_data->>'research_title_purpose','date_received',p_data->>'date_received','status','received');
 ELSE
  item:=jsonb_build_object('department_id',p_data->>'department_id','personnel_number',p_data->>'personnel_number','person_name',p_data->>'person_name','occurred_at',p_data->>'occurred_at','attendance_status',p_data->>'attendance_status','external_location_id',p_data->>'external_location_id','employment_id_number',p_data->>'employment_id_number','workcode',p_data->>'workcode','verify_code',p_data->>'verify_code','card_number',p_data->>'card_number','raw_source',jsonb_build_object('ENTRY METHOD','Manual'));
 END IF;
 RETURN core.submit_data_submission(slug,'manual',jsonb_build_array(item),NULL);
END; $$;
GRANT EXECUTE ON FUNCTION core.stage_manual_submission(text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION core.stage_manual_submission(text,jsonb) FROM public;
CREATE OR REPLACE FUNCTION core.reject_account(applicant_id uuid, decision_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_role core.app_role;
BEGIN
 SELECT role INTO actor_role FROM core.profiles WHERE id=auth.uid() AND status='active';
 IF actor_role NOT IN ('dpo','system_admin') THEN RAISE EXCEPTION 'Account management authority required' USING errcode='42501'; END IF;
 UPDATE core.profiles SET status='rejected',updated_at=now() WHERE id=applicant_id AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending account not found' USING errcode='P0002'; END IF;
 INSERT INTO core.account_decisions(profile_id,decision,decided_by,reason) VALUES(applicant_id,'rejected',auth.uid(),decision_reason);
 INSERT INTO core.audit_events(actor_id,action,target_type,target_id,summary,metadata) VALUES(auth.uid(),'account.rejected','profile',applicant_id::text,'Account request rejected',jsonb_build_object('reason',decision_reason));
END; $$;
-- Attachments are private files; only the DPO can read their metadata or file bytes.
CREATE TABLE research.request_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES research.requests(id) ON DELETE CASCADE,
 attachment_type text NOT NULL CHECK(attachment_type IN ('identification','request_letter')),
 storage_path text NOT NULL,
 content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(request_id,attachment_type)
);
ALTER TABLE research.request_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY request_attachments_dpo_read ON research.request_attachments FOR SELECT TO authenticated USING(core.can_access_dataset('research_requests'));

CREATE OR REPLACE FUNCTION core.create_research_request(p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE did uuid; dep uuid; rid uuid;
BEGIN
 IF NOT core.is_active_admin('dpo') THEN RAISE EXCEPTION 'DPO authority required' USING errcode='42501'; END IF;
 dep := nullif(p_data->>'department_id','')::uuid;
 IF dep IS NULL OR NOT EXISTS(SELECT 1 FROM core.departments WHERE id=dep AND is_active) THEN RAISE EXCEPTION 'Choose an active department'; END IF;
 IF length(trim(coalesce(p_data->>'requester_name',''))) NOT BETWEEN 2 AND 160 OR length(trim(coalesce(p_data->>'research_title_purpose',''))) NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'Requester and purpose are required'; END IF;
 IF coalesce(p_data->>'request_type','') NOT IN ('data_request','interview_request') THEN RAISE EXCEPTION 'Choose a request type'; END IF;
 SELECT id INTO did FROM core.datasets WHERE slug='research_requests';
 INSERT INTO research.requests(department_id,submitted_at,request_type,category,requester_name,institution_office,research_title_purpose,date_received,status,decision_notes,created_by,updated_by)
 VALUES(dep,now(),p_data->>'request_type',nullif(trim(p_data->>'category'),''),trim(p_data->>'requester_name'),nullif(trim(p_data->>'institution_office'),''),trim(p_data->>'research_title_purpose'),nullif(p_data->>'date_received','')::date,'received',nullif(trim(p_data->>'decision_notes'),''),auth.uid(),auth.uid()) RETURNING id INTO rid;
 INSERT INTO core.audit_events(actor_id,dataset_id,action,target_type,target_id,summary,metadata) VALUES(auth.uid(),did,'record.created','record',rid::text,'Research request added manually',jsonb_build_object('request_type',p_data->>'request_type'));
 RETURN rid;
END; $$;
GRANT EXECUTE ON FUNCTION core.create_research_request(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION core.create_research_request(jsonb) FROM public;

CREATE OR REPLACE FUNCTION core.delete_record(p_module text,p_record_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE slug text; did uuid; dep uuid; deleted boolean:=false;
BEGIN
 IF NOT core.is_active_admin('dpo') THEN RAISE EXCEPTION 'DPO authority required' USING errcode='42501'; END IF;
 slug:=CASE p_module WHEN 'jobseekers' THEN 'jobseeker_registry' WHEN 'research' THEN 'research_requests' WHEN 'biometrics' THEN 'biometric_events' ELSE NULL END;
 IF slug IS NULL THEN RAISE EXCEPTION 'Unknown database'; END IF;
 SELECT id INTO did FROM core.datasets WHERE core.datasets.slug=slug;
 IF p_module='jobseekers' THEN DELETE FROM jobseekers.people WHERE id=p_record_id RETURNING department_id INTO dep;
 ELSIF p_module='research' THEN DELETE FROM research.requests WHERE id=p_record_id RETURNING department_id INTO dep;
 ELSE DELETE FROM biometrics.device_events WHERE id=p_record_id RETURNING department_id INTO dep; END IF;
 deleted:=FOUND;
 IF NOT deleted THEN RAISE EXCEPTION 'Record not found' USING errcode='P0002'; END IF;
 INSERT INTO core.audit_events(actor_id,dataset_id,action,target_type,target_id,summary,metadata) VALUES(auth.uid(),did,'record.deleted','record',p_record_id::text,'Record permanently deleted',jsonb_build_object('module',p_module,'department_id',dep));
END; $$;
GRANT EXECUTE ON FUNCTION core.delete_record(text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION core.delete_record(text,uuid) FROM public;

DROP POLICY IF EXISTS audit_read ON core.audit_events;
CREATE POLICY audit_read ON core.audit_events FOR SELECT TO authenticated USING(
 core.is_active_admin('dpo')
 OR (EXISTS(SELECT 1 FROM core.profiles p WHERE p.id=auth.uid() AND p.role='system_admin' AND p.status='active') AND dataset_id IS NULL)
 OR (dataset_id IS NOT NULL AND EXISTS(SELECT 1 FROM core.datasets d WHERE d.id=dataset_id AND core.can_access_dataset(d.slug)))
);
DROP POLICY IF EXISTS imports_read ON core.import_jobs;
CREATE POLICY imports_read ON core.import_jobs FOR SELECT TO authenticated USING(
 core.is_active_admin('dpo')
);
ALTER TABLE research.requests ADD COLUMN IF NOT EXISTS requester_email text;
ALTER TABLE research.requests ADD COLUMN IF NOT EXISTS released_at timestamptz;
ALTER TABLE research.requests ADD COLUMN IF NOT EXISTS released_by uuid REFERENCES core.profiles(id);
ALTER TABLE research.requests ADD COLUMN IF NOT EXISTS release_method text;
ALTER TABLE research.requests ADD COLUMN IF NOT EXISTS release_notes text;

CREATE OR REPLACE FUNCTION core.transition_data_request(p_request_id uuid,p_action text,p_method text DEFAULT NULL,p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r research.requests%rowtype; did uuid;
BEGIN
 IF NOT core.is_active_admin('dpo') THEN RAISE EXCEPTION 'DPO authority required' USING errcode='42501'; END IF;
 SELECT * INTO r FROM research.requests WHERE id=p_request_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found' USING errcode='P0002'; END IF;
 IF p_action='approve' AND r.status='received' THEN
  UPDATE research.requests SET status='approved',updated_by=auth.uid(),updated_at=now(),version=version+1 WHERE id=r.id;
 ELSIF p_action='release' AND r.status='approved' THEN
  UPDATE research.requests SET status='released',released_at=now(),released_by=auth.uid(),release_method=left(coalesce(p_method,'hand_delivery'),40),release_notes=left(coalesce(p_notes,''),1000),updated_by=auth.uid(),updated_at=now(),version=version+1 WHERE id=r.id;
 ELSIF p_action='return' AND r.status='received' THEN
  UPDATE research.requests SET status='needs_information',decision_notes=left(coalesce(p_notes,''),1000),updated_by=auth.uid(),updated_at=now(),version=version+1 WHERE id=r.id;
 ELSE RAISE EXCEPTION 'This request cannot take that action from its current status' USING errcode='40001'; END IF;
 SELECT id INTO did FROM core.datasets WHERE slug='research_requests';
 INSERT INTO core.audit_events(actor_id,dataset_id,action,target_type,target_id,summary,metadata)
 VALUES(auth.uid(),did,'request.'||p_action,'research_request',r.id::text,'DPO updated a data request',jsonb_build_object('request_type',r.request_type,'previous_status',r.status,'release_method',p_method,'notes',left(coalesce(p_notes,''),300)));
END; $$;
GRANT EXECUTE ON FUNCTION core.transition_data_request(uuid,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION core.transition_data_request(uuid,text,text,text) FROM public;