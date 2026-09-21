begin;

create or replace function core.reject_account(
  applicant_id uuid,
  decision_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.is_active_admin('dpo') then
    raise exception 'DPO authorization required' using errcode = '42501';
  end if;

  perform 1
  from core.profiles
  where id = applicant_id and status = 'pending'
  for update;
  if not found then
    raise exception 'Pending applicant not found' using errcode = 'P0002';
  end if;

  update core.profiles
  set status = 'rejected',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  where id = applicant_id;

  update core.user_dataset_grants
  set revoked_at = now()
  where user_id = applicant_id and revoked_at is null;

  insert into core.account_decisions (profile_id, decision, decided_by, reason)
  values (applicant_id, 'rejected', auth.uid(), decision_reason);

  insert into core.audit_events (
    actor_id, action, target_type, target_id, summary, metadata
  ) values (
    auth.uid(), 'account.rejected', 'profile', applicant_id::text,
    'Account request rejected',
    jsonb_build_object('reason_provided', nullif(trim(decision_reason), '') is not null)
  );
end;
$$;

revoke all on function core.reject_account(uuid, text) from public;
grant execute on function core.reject_account(uuid, text) to authenticated;

commit;
