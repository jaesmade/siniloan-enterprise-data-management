begin;

create or replace function core.update_account_access(
  target_user_id uuid,
  updated_department_id uuid,
  updated_role core.app_role,
  dataset_grants jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile core.profiles%rowtype;
  grant_item jsonb;
  target_dataset_id uuid;
  requested_mode core.access_mode;
begin
  if not core.is_active_admin('dpo') then
    raise exception 'DPO authorization required' using errcode = '42501';
  end if;
  if updated_role = 'dpo' then
    raise exception 'DPO access must use the controlled bootstrap process' using errcode = '42501';
  end if;

  select * into target_profile
  from core.profiles
  where id = target_user_id and status = 'active'
  for update;
  if target_profile.id is null then
    raise exception 'Active account not found' using errcode = 'P0002';
  end if;
  if target_profile.role = 'dpo' then
    raise exception 'The DPO account cannot be edited here' using errcode = '42501';
  end if;

  perform 1 from core.departments where id = updated_department_id and is_active;
  if not found then
    raise exception 'Approved department not found' using errcode = 'P0002';
  end if;

  update core.profiles
  set department_id = updated_department_id,
      role = updated_role,
      updated_at = now()
  where id = target_user_id;

  update core.user_dataset_grants
  set revoked_at = now()
  where user_id = target_user_id and revoked_at is null;

  for grant_item in select value from jsonb_array_elements(coalesce(dataset_grants, '[]'::jsonb)) loop
    select id into target_dataset_id
    from core.datasets
    where slug = grant_item ->> 'dataset_slug' and is_active;
    if target_dataset_id is null then raise exception 'Unknown dataset'; end if;
    requested_mode := (grant_item ->> 'access_mode')::core.access_mode;
    insert into core.user_dataset_grants
      (user_id, dataset_id, access_mode, department_scope_id, granted_by)
    values
      (target_user_id, target_dataset_id, requested_mode,
       nullif(grant_item ->> 'department_scope_id', '')::uuid, auth.uid());
  end loop;

  insert into core.audit_events (
    actor_id, action, target_type, target_id, summary, metadata
  ) values (
    auth.uid(), 'account.access_updated', 'profile', target_user_id::text,
    'Account role, department, or dataset access updated',
    jsonb_build_object(
      'previous_role', target_profile.role,
      'updated_role', updated_role,
      'previous_department_id', target_profile.department_id,
      'updated_department_id', updated_department_id,
      'dataset_grant_count', jsonb_array_length(coalesce(dataset_grants, '[]'::jsonb))
    )
  );
end;
$$;

revoke all on function core.update_account_access(uuid, uuid, core.app_role, jsonb) from public;
grant execute on function core.update_account_access(uuid, uuid, core.app_role, jsonb) to authenticated;

commit;
