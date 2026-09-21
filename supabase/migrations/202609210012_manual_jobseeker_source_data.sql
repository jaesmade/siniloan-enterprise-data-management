begin;

do $migration$
declare
  definition text;
  previous_metadata text := $metadata$jsonb_build_object('EMPLOYMENT STATUS',nullif(trim(p_data->>'employment_status'),''),'PREFERRED CCUPATION/S',nullif(trim(p_data->>'preferred_occupation'),''),'ENTRY METHOD','Manual')$metadata$;
  expanded_metadata text := $metadata$coalesce(p_data->'metadata','{}'::jsonb) || jsonb_build_object('EMPLOYMENT STATUS',nullif(trim(p_data->>'employment_status'),''),'HIGHEST EDUCATIONAL ATTAINMENT',nullif(trim(p_data->>'highest_education'),''),'PREFERRED CCUPATION/S',nullif(trim(p_data->>'preferred_occupation'),''),'ENTRY METHOD','Manual')$metadata$;
begin
  select pg_get_functiondef('core.create_manual_record(text,jsonb)'::regprocedure) into definition;
  -- Some deployments already contain the expanded metadata body because the
  -- preceding function migration was corrected before it was applied. Treat
  -- that state as successfully migrated instead of failing this no-op update.
  if position(expanded_metadata in definition) > 0 then
    null;
  elsif position(previous_metadata in definition) > 0 then
    execute replace(definition, previous_metadata, expanded_metadata);
  else
    raise exception 'Manual-record function does not match the expected version';
  end if;
end;
$migration$;

commit;
