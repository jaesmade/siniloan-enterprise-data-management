begin;

create table core.rate_limit_buckets (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  primary key (scope, key_hash)
);

alter table core.rate_limit_buckets enable row level security;
revoke all on core.rate_limit_buckets from anon, authenticated;

create or replace function core.check_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  bucket core.rate_limit_buckets%rowtype;
  window_interval interval;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Rate limiter access denied' using errcode = '42501';
  end if;
  if p_scope !~ '^[a-z0-9_.-]{1,64}$' or p_key_hash !~ '^[a-f0-9]{64}$'
    or p_limit < 1 or p_limit > 1000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limiter parameters' using errcode = '22023';
  end if;

  window_interval := make_interval(secs => p_window_seconds);
  insert into core.rate_limit_buckets as limits (scope, key_hash, window_started_at, attempts)
  values (p_scope, p_key_hash, now(), 1)
  on conflict (scope, key_hash) do update
  set attempts = case when limits.window_started_at <= now() - window_interval then 1 else limits.attempts + 1 end,
      window_started_at = case when limits.window_started_at <= now() - window_interval then now() else limits.window_started_at end
  returning * into bucket;

  allowed := bucket.attempts <= p_limit;
  remaining := greatest(0, p_limit - bucket.attempts);
  retry_after_seconds := case when allowed then 0 else greatest(1, ceil(extract(epoch from bucket.window_started_at + window_interval - now()))::integer) end;
  return next;
end;
$$;

revoke all on function core.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function core.check_rate_limit(text, text, integer, integer) to service_role;

commit;
