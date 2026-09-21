-- The server-side username login route resolves a username to the email used
-- internally by Supabase Auth. These columns remain unavailable to browsers.
grant select (username, email) on core.profiles to service_role;
