-- Label interview request workflow activity accurately.
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
 VALUES(auth.uid(),did,'request.'||p_action,'research_request',r.id::text,CASE WHEN r.request_type='interview_request' THEN 'DPO updated an interview request' ELSE 'DPO updated a data request' END,jsonb_build_object('request_type',r.request_type,'previous_status',r.status,'release_method',p_method,'notes',left(coalesce(p_notes,''),300)));
END; $$;
