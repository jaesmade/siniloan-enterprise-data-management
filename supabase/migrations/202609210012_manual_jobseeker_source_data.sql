begin;

do $migration$
declare
  definition text;
  previous_metadata text := $metadata$jsonb_build_object('EMPLOYMENT STATUS',nullif(trim(p_data->>'employment_status'),''),'PREFERRED CCUPATION/S',nullif(trim(p_data->>'preferred_occupation'),''),'ENTRY METHOD','Manual')$metadata$;
  expanded_metadata text := $metadata$coalesce(p_data->'metadata','{}'::jsonb) || jsonb_build_object('EMPLOYMENT STATUS',nullif(trim(p_data->>'employment_status'),''),'HIGHEST EDUCATIONAL ATTAINMENT',nullif(trim(p_data->>'highest_education'),''),'PREFERRED CCUPATION/S',nullif(trim(p_data->>'preferred_occupation'),''),'ENTRY METHOD','Manual')$metadata$;
begin
  select pg_get_functiondef('core.create_manual_record(text,jsonb)'::regprocedure) into definition;
  if position(previous_metadata in definition) = 0 then
    raise exception 'Manual-record function does not match the expected version';
  end if;
  execute replace(definition, previous_metadata, expanded_metadata);
end;
$migration$;

commit;
