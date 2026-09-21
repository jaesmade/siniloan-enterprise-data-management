begin;

create or replace function core.record_auth_event(
  event_actor_id uuid,
  attempted_username text,
  event_outcome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role authorization required' using errcode = '42501';
  end if;
  if event_outcome not in ('success', 'failure') then
    raise exception 'Invalid authentication outcome';
  end if;

  insert into core.audit_events (
    source, actor_id, action, outcome, target_type, target_id, summary, metadata
  ) values (
    'authentication', event_actor_id, 'auth.login', event_outcome,
    'session', null,
    case when event_outcome = 'success' then 'Successful sign-in' else 'Failed sign-in attempt' end,
    jsonb_build_object('username', left(coalesce(attempted_username, ''), 40))
  );
end;
$$;

revoke all on function core.record_auth_event(uuid, text, text) from public;
grant execute on function core.record_auth_event(uuid, text, text) to service_role;
grant select (id, username, email) on core.profiles to service_role;

commit;
