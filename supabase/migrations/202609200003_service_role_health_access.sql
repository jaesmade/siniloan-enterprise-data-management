-- Server-only health checks use the service role. This role is never exposed to browsers.
grant usage on schema core to service_role;
grant select on core.datasets to service_role;
