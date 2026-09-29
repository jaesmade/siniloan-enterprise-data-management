-- Fetch a small review preview only when a DPO opens a submission.
-- SECURITY INVOKER preserves data_submissions grants and row-level policies.
CREATE FUNCTION core.data_submission_preview(p_submission_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT (
    SELECT coalesce(jsonb_agg(item - 'metadata' - 'raw_source' ORDER BY position), '[]'::jsonb)
    FROM jsonb_path_query(s.payload, '$[0 to 29]') WITH ORDINALITY AS preview(item, position)
  )
  FROM core.data_submissions s
  WHERE s.id = p_submission_id AND s.status = 'pending_review';
$$;

REVOKE ALL ON FUNCTION core.data_submission_preview(uuid) FROM public;
GRANT EXECUTE ON FUNCTION core.data_submission_preview(uuid) TO authenticated;
