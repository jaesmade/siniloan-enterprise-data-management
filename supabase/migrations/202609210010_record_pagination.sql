begin;
-- Run with the caller's privileges so existing department and dataset RLS applies.
create function core.query_records(
  p_module text, p_search text default '', p_status text default '',
  p_secondary text default '', p_from date default null, p_to date default null,
  p_sort text default 'created_at', p_desc boolean default true,
  p_page integer default 1, p_size integer default 25
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  source_sql text;
  result jsonb;
begin
  if p_page is null or p_page < 1 or p_size is null or p_size not in (25,50,100)
    or p_sort is null or p_sort not in ('created_at','name','status','secondary','record_date')
    or length(p_search)>200 or length(p_secondary)>200 or length(p_status)>200
    or p_from > p_to then
    raise exception 'Invalid record filters or pagination' using errcode = '22023';
  end if;
  case p_module
  when 'jobseekers' then source_sql := $q$
    select to_jsonb(t) as record, id, created_at,
      concat_ws(' ', first_name, nullif(middle_name,''), surname) as name,
      coalesce(metadata->>'EMPLOYMENT STATUS','') as status,
      coalesce(metadata->>'PREFERRED CCUPATION/S',metadata->>'PREFERRED OCCUPATION/S','') as secondary,
      created_at::date as record_date,
      concat_ws(' ',first_name,middle_name,surname,metadata->>'EMPLOYMENT STATUS',metadata->>'PREFERRED CCUPATION/S',metadata->>'PREFERRED OCCUPATION/S') as search_text
    from jobseekers.people t$q$;
  when 'research' then source_sql := $q$
    select to_jsonb(t) as record, id, created_at, requester_name as name,
      status::text as status, coalesce(category,'') as secondary, date_received as record_date,
      concat_ws(' ',control_number,requester_name,institution_office,research_title_purpose,status,category) as search_text
    from research.requests t$q$;
  when 'biometrics' then source_sql := $q$
    select to_jsonb(t) as record, id, created_at, person_name as name,
      coalesce(attendance_status,'') as status, coalesce(external_location_id,'') as secondary,
      (occurred_at at time zone 'Asia/Manila')::date as record_date,
      concat_ws(' ',person_name,personnel_number,attendance_status,external_location_id,verify_code) as search_text
    from biometrics.device_events t$q$;
  else raise exception 'Unknown module' using errcode = '22023';
  end case;
  execute format($q$
    with source as materialized (%s), matches as materialized (
      select * from source where
        strpos(lower(search_text),lower(trim(coalesce($1,'')))) > 0
        and ($2 = '' or status = $2)
        and strpos(lower(secondary),lower(trim(coalesce($3,'')))) > 0
        and ($4 is null or record_date >= $4) and ($5 is null or record_date <= $5)
    ), totals as (select count(*) as total from matches), paging as (
      select total, least($6::bigint,greatest(1,(total+$7-1)/$7)) as page from totals
    ), page_rows as (
      select record from matches order by %I %s nulls last, id %s
      limit $7 offset (select (page-1)*$7 from paging)
    ) select jsonb_build_object(
      'rows',coalesce((select jsonb_agg(record) from page_rows),'[]'::jsonb),
      'total',(select total from paging),'page',(select page from paging),
      'statuses',coalesce((select jsonb_agg(status order by status) from
        (select distinct status from source where status <> '') s),'[]'::jsonb)
    )$q$,source_sql,p_sort,case when p_desc then 'desc' else 'asc' end,case when p_desc then 'desc' else 'asc' end)
    into result using p_search,coalesce(p_status,''),p_secondary,p_from,p_to,p_page,p_size;
  return result;
end;
$$;
revoke all on function core.query_records(text,text,text,text,date,date,text,boolean,integer,integer) from public;
grant execute on function core.query_records(text,text,text,text,date,date,text,boolean,integer,integer) to authenticated;
commit;
