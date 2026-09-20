# Database implementation

The database uses the same PostgreSQL migration for hosted Supabase and local tests. The initial migration creates four schemas:

- `core`: accounts, departments, module registration, dataset grants, DPO decisions, audit events, and import jobs.
- `jobseekers`: people and registrations.
- `research`: research and data requests plus their workflow status.
- `biometrics`: subjects, locations, and device attendance events.

## Local setup

1. Install and start Docker Desktop or Podman.
2. Copy `.env.example` to `.env.local`.
3. Run `npm run db:start`.
4. Copy the local API URL and publishable key printed by Supabase into `.env.local`.
5. Run `npm run db:reset` whenever the migrations or seed data change.
6. Run `npm run db:types` after a successful reset to generate database types.
7. Start Next.js with `npm run dev`.

The database health endpoint is `GET /api/health/database`. It returns HTTP 200 after Supabase is configured and the signed-in account can see the dataset catalog. It returns HTTP 503 when the database is unavailable or environment variables are missing.

## Security model

New Supabase Auth users receive a `core.profiles` row with `pending` status. Pending, rejected, and suspended profiles cannot open module data. A DPO activates an account through `core.approve_account`, which updates the approved department and role, replaces dataset grants, records the decision, and appends an audit event in one transaction.

Every module table has row-level security. `read_only` grants permit selection; `read_write` grants permit selection and mutation. An optional department scope limits rows inside a dataset. DPO accounts can access every registered dataset. Data Stewards receive global dashboard visibility through the core administrative checks but still need a dataset grant to open underlying module records.

Passwords remain in Supabase Auth. Service-role credentials stay server-only and must never use a `NEXT_PUBLIC_` name.

## Adding a module

Add its schema and tables in a new timestamped migration, register its module and datasets in `core.modules` and `core.datasets`, add RLS policies using `core.can_access_dataset`, then regenerate the TypeScript types. This keeps future modules independent while preserving one authorization and audit model.
