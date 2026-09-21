import { createClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicSupabaseEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

const invalidCredentials = () =>
  Response.json(
    { error: "We could not sign you in. Check your username and password." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );

export async function POST(request: Request) {
  let credentials: { username?: unknown; password?: unknown };
  try {
    credentials = await request.json();
  } catch {
    return invalidCredentials();
  }

  const username = typeof credentials.username === "string" ? credentials.username.trim() : "";
  const password = typeof credentials.password === "string" ? credentials.password : "";
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username) || !password) return invalidCredentials();

  const admin = createAdminClient();
  const { data: profile, error: lookupError } = await admin
    .schema("core")
    .from("profiles")
    .select("email")
    .ilike("username", username)
    .maybeSingle();
  if (lookupError || !profile?.email) return invalidCredentials();

  const { url, publishableKey } = getPublicSupabaseEnv();
  const supabase = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password,
  });
  if (error || !data.session) return invalidCredentials();

  return Response.json(
    {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
