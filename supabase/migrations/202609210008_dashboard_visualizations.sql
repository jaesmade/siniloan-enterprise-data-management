begin;

create or replace function core.dataset_visualization_stats(requested_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  primary_data jsonb := '[]'::jsonb;
  secondary_data jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not core.can_access_dataset(requested_slug) then
    raise exception 'Dataset access denied' using errcode = '42501';
  end if;

  if requested_slug = 'jobseeker_registry' then
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb)
    into primary_data
    from (
      select coalesce(nullif(trim(metadata ->> 'EMPLOYMENT STATUS'), ''), 'Unspecified') label, count(*)::integer value
      from jobseekers.people
      where archived_at is null and core.can_access_dataset(requested_slug, 'read_only', department_id)
      group by 1 order by 2 desc limit 8
    ) stats;
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb)
    into secondary_data
    from (
      select coalesce(nullif(trim(metadata ->> 'PREFERRED CCUPATION/S'), ''), 'Unspecified') label, count(*)::integer value
      from jobseekers.people
      where archived_at is null and core.can_access_dataset(requested_slug, 'read_only', department_id)
      group by 1 order by 2 desc limit 8
    ) stats;
  elsif requested_slug = 'research_requests' then
    select coalesce(jsonb_agg(jsonb_build_object('label', initcap(replace(label, '_', ' ')), 'value', value)), '[]'::jsonb)
    into primary_data
    from (
      select status::text label, count(*)::integer value
      from research.requests
      where archived_at is null and core.can_access_dataset(requested_slug, 'read_only', department_id)
      group by 1 order by 2 desc
    ) stats;
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb)
    into secondary_data
    from (
      select coalesce(nullif(trim(category), ''), 'Unspecified') label, count(*)::integer value
      from research.requests
      where archived_at is null and core.can_access_dataset(requested_slug, 'read_only', department_id)
      group by 1 order by 2 desc limit 8
    ) stats;
  elsif requested_slug = 'biometric_events' then
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb)
    into primary_data
    from (
      select coalesce(nullif(trim(attendance_status), ''), 'Unspecified') label, count(*)::integer value
      from biometrics.device_events
      where core.can_access_dataset(requested_slug, 'read_only', department_id)
      group by 1 order by 2 desc limit 8
    ) stats;
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', value)), '[]'::jsonb)
    into secondary_data
    from (
      select coalesce(nullif(trim(external_location_id), ''), 'Unspecified') label, count(*)::integer value
      from biometrics.device_events
      where core.can_access_dataset(requested_slug, 'read_only', department_id)
      group by 1 order by 2 desc limit 8
    ) stats;
  else
    raise exception 'Unknown dataset';
  end if;

  return jsonb_build_object('primary', primary_data, 'secondary', secondary_data);
end;
$$;

revoke all on function core.dataset_visualization_stats(text) from public;
grant execute on function core.dataset_visualization_stats(text) to authenticated;

commit;
