begin;

create or replace function core.manage_department(p_action text, p_department_id uuid default null, p_name text default null, p_code text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  if not core.is_active_admin('dpo') then raise exception 'DPO authority required' using errcode='42501'; end if;
  if p_action='create' then
    if length(trim(coalesce(p_name,''))) < 2 or length(trim(coalesce(p_code,''))) < 2 then raise exception 'Department name and code are required' using errcode='22023'; end if;
    insert into core.departments(name,code,is_active) values(trim(p_name),upper(trim(p_code)),true) returning id into result_id;
  elsif p_action='deactivate' then
    if p_department_id is null then raise exception 'Department is required' using errcode='22023'; end if;
    if exists(select 1 from core.profiles where department_id=p_department_id and status='active') then raise exception 'Move active accounts before removing this department' using errcode='23503'; end if;
    update core.departments set is_active=false where id=p_department_id returning id into result_id;
    if result_id is null then raise exception 'Department not found' using errcode='P0002'; end if;
  else raise exception 'Unknown department action' using errcode='22023'; end if;
  return result_id;
end; $$;

revoke all on function core.manage_department(text,uuid,text,text) from public;
grant execute on function core.manage_department(text,uuid,text,text) to authenticated;
commit;
