import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(projectRoot, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const equals = line.indexOf("=");
      return [line.slice(0, equals), line.slice(equals + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
  throw new Error("This bootstrap command requires the local Supabase URL and keys in .env.local.");
}

const docker = join(process.env.LOCALAPPDATA ?? "", "Programs", "DockerDesktop", "resources", "bin", "docker.exe");
function query(sql) {
  return execFileSync(docker, ["exec", "supabase_db_siniloan-enterprise-data", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8" }).trim();
}

const existing = query("select count(*) from core.profiles where (role = 'dpo' and status = 'active') or lower(username) = 'admin'");
if (existing !== "0") throw new Error("A DPO or the admin username already exists; bootstrap stopped.");

const username = "admin";
const email = "admin@siniloan.invalid";
const password = randomBytes(24).toString("base64url");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Local DPO Administrator", username },
});
if (error || !data.user?.id) throw new Error(`Could not create the local Auth account: ${error?.message ?? "missing user ID"}`);

const userId = data.user.id;
if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error("Supabase returned an invalid user ID.");
const sql = `
begin;
do $bootstrap$
declare dpo_department uuid;
begin
  if exists (select 1 from core.profiles where role = 'dpo' and status = 'active') then
    raise exception 'An active DPO already exists';
  end if;
  select id into dpo_department from core.departments where code = 'DPO' and is_active;
  if dpo_department is null then raise exception 'DPO department is missing'; end if;
  update core.profiles
  set role = 'dpo', status = 'active', department_id = dpo_department,
      approved_at = now(), updated_at = now()
  where id = '${userId}' and username = 'admin' and status = 'pending';
  if not found then raise exception 'New admin profile was not created'; end if;
  insert into core.account_decisions (profile_id, decision, decided_by, reason)
  values ('${userId}', 'active', '${userId}', 'Initial local DPO bootstrap');
  insert into core.audit_events (actor_id, action, target_type, target_id, summary, metadata)
  values ('${userId}', 'account.bootstrap_dpo', 'profile', '${userId}',
          'Initial local DPO account provisioned', '{"source":"local_bootstrap"}');
end
$bootstrap$;
commit;`;

try {
  query(sql);
} catch (bootstrapError) {
  await admin.auth.admin.deleteUser(userId);
  throw bootstrapError;
}

const profile = query(`select role::text || ':' || status::text from core.profiles where id = '${userId}'`);
if (profile !== "dpo:active") throw new Error("Created account, but DPO profile verification failed.");

const appResponse = await fetch("http://127.0.0.1:3001/api/auth/sign-in", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3001" },
  body: JSON.stringify({ username, password }),
});

console.log(`Username: ${username}`);
console.log(`Password: ${password}`);
console.log(`DPO profile: ${profile}`);
console.log(`App sign-in check: ${appResponse.status}`);
if (!appResponse.ok) process.exitCode = 1;
