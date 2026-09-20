begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create schema if not exists core;
create schema if not exists jobseekers;
create schema if not exists research;
create schema if not exists biometrics;

create type core.account_status as enum ('pending', 'active', 'rejected', 'suspended');
create type core.app_role as enum ('dpo', 'data_steward', 'staff');
create type core.access_mode as enum ('read_only', 'read_write');
create type core.job_status as enum ('queued', 'processing', 'completed', 'failed', 'cancelled');
create type research.request_status as enum ('received', 'under_review', 'needs_information', 'approved', 'denied', 'released', 'closed');

create table core.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_code_format check (code ~ '^[A-Z0-9_-]{2,32}$')
);
create unique index departments_code_unique on core.departments (lower(code));
create unique index departments_name_unique on core.departments (lower(name));

create table core.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  username text not null check (username ~ '^[A-Za-z0-9._-]{3,40}$'),
  email text not null,
  requested_department_id uuid references core.departments(id),
  department_id uuid references core.departments(id),
  role core.app_role not null default 'staff',
  status core.account_status not null default 'pending',
  approved_by uuid references core.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_unique on core.profiles (lower(username));
create unique index profiles_email_unique on core.profiles (lower(email));
create index profiles_status_created_idx on core.profiles (status, created_at desc);
create index profiles_department_idx on core.profiles (department_id);

create table core.modules (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9_]{1,62}$'),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table core.datasets (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references core.modules(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z][a-z0-9_]{1,62}$'),
  name text not null,
  classification text not null default 'restricted' check (classification in ('internal', 'restricted', 'highly_restricted')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index datasets_module_idx on core.datasets (module_id);

create table core.user_dataset_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.profiles(id) on delete cascade,
  dataset_id uuid not null references core.datasets(id) on delete cascade,
  access_mode core.access_mode not null,
  department_scope_id uuid references core.departments(id),
  granted_by uuid not null references core.profiles(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint user_dataset_grants_active_unique exclude using gist
    (user_id with =, dataset_id with =) where (revoked_at is null)
);
create index grants_user_active_idx on core.user_dataset_grants (user_id, dataset_id) where revoked_at is null;

create table core.account_decisions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references core.profiles(id) on delete restrict,
  decision core.account_status not null check (decision in ('active', 'rejected', 'suspended')),
  decided_by uuid not null references core.profiles(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now()
);
create index account_decisions_profile_idx on core.account_decisions (profile_id, created_at desc);

create table core.audit_events (
  id bigint generated always as identity primary key,
  source text not null default 'database',
  source_event_id text,
  occurred_at timestamptz not null default now(),
  ingested_at timestamptz not null default now(),
  actor_id uuid references core.profiles(id) on delete set null,
  dataset_id uuid references core.datasets(id) on delete set null,
  action text not null,
  outcome text not null default 'success' check (outcome in ('success', 'failure', 'denied')),
  target_type text,
  target_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  constraint audit_events_source_unique unique nulls not distinct (source, source_event_id)
);
create index audit_events_time_idx on core.audit_events (occurred_at desc, id desc);
create index audit_events_dataset_time_idx on core.audit_events (dataset_id, occurred_at desc, id desc);
create index audit_events_actor_time_idx on core.audit_events (actor_id, occurred_at desc, id desc);

create table core.import_jobs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references core.datasets(id),
  requested_by uuid not null references core.profiles(id),
  status core.job_status not null default 'queued',
  source_filename text not null,
  source_storage_path text,
  mapping_version text,
  total_rows integer not null default 0 check (total_rows >= 0),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  accepted_rows integer not null default 0 check (accepted_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index import_jobs_dataset_created_idx on core.import_jobs (dataset_id, created_at desc);

create table core.import_row_errors (
  id bigint generated always as identity primary key,
  import_job_id uuid not null references core.import_jobs(id) on delete cascade,
  source_row_number integer not null check (source_row_number > 0),
  field_name text,
  error_code text not null,
  message text not null,
  safe_context jsonb not null default '{}'::jsonb
);
create index import_row_errors_job_idx on core.import_row_errors (import_job_id, source_row_number);

create table jobseekers.people (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references core.departments(id),
  source_person_id text,
  surname text not null,
  first_name text not null,
  middle_name text,
  suffix text,
  birth_date date,
  sex text,
  email text,
  mobile_number text,
  metadata jsonb not null default '{}'::jsonb,
  import_job_id uuid references core.import_jobs(id),
  source_row_number integer,
  created_by uuid references core.profiles(id),
  updated_by uuid references core.profiles(id),
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index people_department_name_idx on jobseekers.people (department_id, surname, first_name);
create index people_source_id_idx on jobseekers.people (source_person_id) where source_person_id is not null;

create table jobseekers.registrations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references jobseekers.people(id) on delete restrict,
  department_id uuid not null references core.departments(id),
  registration_date date,
  employment_status text,
  highest_education text,
  preferred_occupations text[] not null default '{}',
  created_by uuid references core.profiles(id),
  updated_by uuid references core.profiles(id),
  version integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index registrations_department_date_idx on jobseekers.registrations (department_id, registration_date desc);

create table research.requests (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references core.departments(id),
  submitted_at timestamptz,
  category text,
  requester_name text not null,
  institution_office text,
  research_title_purpose text not null,
  control_number text,
  date_received date,
  status research.request_status not null default 'received',
  assigned_to uuid references core.profiles(id),
  decision_notes text,
  import_job_id uuid references core.import_jobs(id),
  source_row_number integer,
  created_by uuid references core.profiles(id),
  updated_by uuid references core.profiles(id),
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index research_control_number_unique on research.requests (lower(control_number)) where control_number is not null;
create index research_requests_department_status_idx on research.requests (department_id, status, date_received desc);
create index research_requests_assignee_idx on research.requests (assigned_to, status) where archived_at is null;

create table biometrics.locations (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references core.departments(id),
  external_location_id text not null,
  name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (external_location_id)
);

create table biometrics.subjects (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references core.departments(id),
  personnel_number text not null,
  display_name text not null,
  employment_id_number text,
  card_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, personnel_number)
);

create table biometrics.device_events (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references core.departments(id),
  subject_id uuid references biometrics.subjects(id),
  location_id uuid references biometrics.locations(id),
  personnel_number text not null,
  person_name text not null,
  occurred_at timestamptz not null,
  attendance_status text,
  external_location_id text,
  employment_id_number text,
  workcode text,
  verify_code text,
  card_number text,
  import_job_id uuid references core.import_jobs(id),
  source_row_number integer,
  raw_source jsonb not null default '{}'::jsonb,
  created_by uuid references core.profiles(id),
  created_at timestamptz not null default now()
);
create index biometric_events_department_time_idx on biometrics.device_events (department_id, occurred_at desc, id desc);
create index biometric_events_subject_time_idx on biometrics.device_events (subject_id, occurred_at desc);

insert into core.modules (slug, name, description) values
  ('jobseekers', 'Jobseeker Registry', 'Employment profiles and qualifications'),
  ('research', 'Research & Data Requests', 'Controlled municipal data requests'),
  ('biometrics', 'Biometrics Data', 'Attendance device event metadata');

insert into core.datasets (module_id, slug, name, classification)
select id, 'jobseeker_registry', 'Jobseeker Registry', 'highly_restricted' from core.modules where slug = 'jobseekers'
union all
select id, 'research_requests', 'Research & Data Requests', 'restricted' from core.modules where slug = 'research'
union all
select id, 'biometric_events', 'Biometrics Data', 'highly_restricted' from core.modules where slug = 'biometrics';

insert into core.departments (code, name) values
  ('DPO', 'Data Privacy Office'),
  ('MPDO', 'Municipal Planning and Development Office'),
  ('PESO', 'Public Employment Service Office'),
  ('AGRI', 'Agriculture Office'),
  ('RHU', 'Rural Health Unit');

create or replace function core.is_active_admin(required_role core.app_role default 'data_steward')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from core.profiles p
    where p.id = auth.uid() and p.status = 'active'
      and (p.role = 'dpo' or (required_role = 'data_steward' and p.role = 'data_steward'))
  );
$$;

create or replace function core.can_access_dataset(dataset_slug text, required_access core.access_mode default 'read_only', row_department uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from core.profiles p
    where p.id = auth.uid() and p.status = 'active' and (
      p.role = 'dpo' or exists (
        select 1 from core.user_dataset_grants g
        join core.datasets d on d.id = g.dataset_id
        where g.user_id = p.id and d.slug = dataset_slug and d.is_active
          and g.revoked_at is null
          and (required_access = 'read_only' or g.access_mode = 'read_write')
          and (g.department_scope_id is null or row_department is null or g.department_scope_id = row_department)
      )
    )
  );
$$;

create or replace function core.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare requested_department uuid;
begin
  begin
    requested_department := nullif(new.raw_user_meta_data ->> 'department_id', '')::uuid;
  exception when invalid_text_representation then
    requested_department := null;
  end;
  insert into core.profiles (id, full_name, username, email, requested_department_id)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Pending applicant'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1)),
    new.email,
    requested_department
  );
  return new;
end;
$$;

create or replace function core.approve_account(
  applicant_id uuid,
  approved_department_id uuid,
  approved_role core.app_role,
  dataset_grants jsonb,
  decision_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare grant_item jsonb;
declare target_dataset_id uuid;
declare requested_mode core.access_mode;
declare requested_scope uuid;
begin
  if not core.is_active_admin('dpo') then
    raise exception 'DPO authorization required' using errcode = '42501';
  end if;
  if approved_role = 'dpo' then
    raise exception 'DPO promotion requires the controlled bootstrap process' using errcode = '42501';
  end if;

  perform 1 from core.profiles where id = applicant_id for update;
  if not found then raise exception 'Applicant not found' using errcode = 'P0002'; end if;

  update core.profiles
  set status = 'active', department_id = approved_department_id, role = approved_role,
      approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = applicant_id;

  update core.user_dataset_grants
  set revoked_at = now()
  where user_id = applicant_id and revoked_at is null;

  for grant_item in select value from jsonb_array_elements(coalesce(dataset_grants, '[]'::jsonb)) loop
    select id into target_dataset_id from core.datasets
    where slug = grant_item ->> 'dataset_slug' and is_active;
    if target_dataset_id is null then raise exception 'Unknown dataset'; end if;
    requested_mode := (grant_item ->> 'access_mode')::core.access_mode;
    requested_scope := nullif(grant_item ->> 'department_scope_id', '')::uuid;
    insert into core.user_dataset_grants
      (user_id, dataset_id, access_mode, department_scope_id, granted_by)
    values
      (applicant_id, target_dataset_id, requested_mode, requested_scope, auth.uid());
  end loop;

  insert into core.account_decisions (profile_id, decision, decided_by, reason)
  values (applicant_id, 'active', auth.uid(), decision_reason);

  insert into core.audit_events (actor_id, action, target_type, target_id, summary, metadata)
  values (auth.uid(), 'account.approved', 'profile', applicant_id::text,
          'Account approved and dataset grants assigned',
          jsonb_build_object('role', approved_role, 'department_id', approved_department_id));
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function core.handle_new_auth_user();

alter table core.departments enable row level security;
alter table core.profiles enable row level security;
alter table core.modules enable row level security;
alter table core.datasets enable row level security;
alter table core.user_dataset_grants enable row level security;
alter table core.account_decisions enable row level security;
alter table core.audit_events enable row level security;
alter table core.import_jobs enable row level security;
alter table core.import_row_errors enable row level security;
alter table jobseekers.people enable row level security;
alter table jobseekers.registrations enable row level security;
alter table research.requests enable row level security;
alter table biometrics.locations enable row level security;
alter table biometrics.subjects enable row level security;
alter table biometrics.device_events enable row level security;

create policy departments_read on core.departments for select to authenticated using (is_active or core.is_active_admin('dpo'));
create policy profiles_read_self_or_dpo on core.profiles for select to authenticated using (id = auth.uid() or core.is_active_admin('dpo'));
create policy modules_read on core.modules for select to authenticated using (is_active and exists (select 1 from core.profiles p where p.id = auth.uid() and p.status = 'active'));
create policy datasets_read on core.datasets for select to authenticated using (core.is_active_admin('data_steward') or core.can_access_dataset(slug));
create policy grants_read_self_or_dpo on core.user_dataset_grants for select to authenticated using (user_id = auth.uid() or core.is_active_admin('dpo'));
create policy grants_manage_dpo on core.user_dataset_grants for all to authenticated using (core.is_active_admin('dpo')) with check (core.is_active_admin('dpo'));
create policy decisions_read_dpo on core.account_decisions for select to authenticated using (core.is_active_admin('dpo'));
create policy decisions_manage_dpo on core.account_decisions for all to authenticated using (core.is_active_admin('dpo')) with check (core.is_active_admin('dpo'));
create policy audit_read on core.audit_events for select to authenticated using (core.is_active_admin('data_steward') or (dataset_id is not null and exists (select 1 from core.datasets d where d.id = dataset_id and core.can_access_dataset(d.slug))));
create policy imports_read on core.import_jobs for select to authenticated using (exists (select 1 from core.datasets d where d.id = dataset_id and core.can_access_dataset(d.slug)));
create policy imports_create on core.import_jobs for insert to authenticated with check (requested_by = auth.uid() and exists (select 1 from core.datasets d where d.id = dataset_id and core.can_access_dataset(d.slug, 'read_write')));
create policy import_errors_read on core.import_row_errors for select to authenticated using (exists (select 1 from core.import_jobs j join core.datasets d on d.id = j.dataset_id where j.id = import_job_id and core.can_access_dataset(d.slug)));

create policy jobseeker_people_read on jobseekers.people for select to authenticated using (core.can_access_dataset('jobseeker_registry', 'read_only', department_id));
create policy jobseeker_people_write on jobseekers.people for all to authenticated using (core.can_access_dataset('jobseeker_registry', 'read_write', department_id)) with check (core.can_access_dataset('jobseeker_registry', 'read_write', department_id));
create policy jobseeker_registrations_read on jobseekers.registrations for select to authenticated using (core.can_access_dataset('jobseeker_registry', 'read_only', department_id));
create policy jobseeker_registrations_write on jobseekers.registrations for all to authenticated using (core.can_access_dataset('jobseeker_registry', 'read_write', department_id)) with check (core.can_access_dataset('jobseeker_registry', 'read_write', department_id));
create policy research_requests_read on research.requests for select to authenticated using (core.can_access_dataset('research_requests', 'read_only', department_id));
create policy research_requests_write on research.requests for all to authenticated using (core.can_access_dataset('research_requests', 'read_write', department_id)) with check (core.can_access_dataset('research_requests', 'read_write', department_id));
create policy biometric_locations_read on biometrics.locations for select to authenticated using (core.can_access_dataset('biometric_events', 'read_only', department_id));
create policy biometric_locations_write on biometrics.locations for all to authenticated using (core.can_access_dataset('biometric_events', 'read_write', department_id)) with check (core.can_access_dataset('biometric_events', 'read_write', department_id));
create policy biometric_subjects_read on biometrics.subjects for select to authenticated using (core.can_access_dataset('biometric_events', 'read_only', department_id));
create policy biometric_subjects_write on biometrics.subjects for all to authenticated using (core.can_access_dataset('biometric_events', 'read_write', department_id)) with check (core.can_access_dataset('biometric_events', 'read_write', department_id));
create policy biometric_events_read on biometrics.device_events for select to authenticated using (core.can_access_dataset('biometric_events', 'read_only', department_id));
create policy biometric_events_write on biometrics.device_events for all to authenticated using (core.can_access_dataset('biometric_events', 'read_write', department_id)) with check (core.can_access_dataset('biometric_events', 'read_write', department_id));

grant usage on schema core, jobseekers, research, biometrics to authenticated;
grant select on core.departments, core.modules, core.datasets, core.profiles, core.user_dataset_grants, core.account_decisions, core.audit_events, core.import_jobs, core.import_row_errors to authenticated;
grant insert on core.import_jobs to authenticated;
grant select, insert, update on jobseekers.people, jobseekers.registrations, research.requests, biometrics.locations, biometrics.subjects, biometrics.device_events to authenticated;
grant usage, select on all sequences in schema core to authenticated;
revoke all on function core.is_active_admin(core.app_role) from public;
revoke all on function core.can_access_dataset(text, core.access_mode, uuid) from public;
revoke all on function core.approve_account(uuid, uuid, core.app_role, jsonb, text) from public;
grant execute on function core.is_active_admin(core.app_role) to authenticated;
grant execute on function core.can_access_dataset(text, core.access_mode, uuid) to authenticated;
grant execute on function core.approve_account(uuid, uuid, core.app_role, jsonb, text) to authenticated;

commit;
