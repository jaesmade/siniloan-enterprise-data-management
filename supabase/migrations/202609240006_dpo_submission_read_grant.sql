-- Allow the DPO approval queue to read pending submissions through PostgREST.
-- Row-level security still limits visible rows to active DPO accounts.
GRANT SELECT ON TABLE core.data_submissions TO authenticated;
