import { createClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/security/request-security";
import { getPublicSupabaseEnv } from "@/lib/supabase/env";

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ status: "forbidden" }, { status: 403 });
  const startedAt = performance.now();
  try {
    const supabase = createAdminClient();
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ status: "unauthorized" }, { status: 401 });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return Response.json({ status: "unauthorized" }, { status: 401 });
    const { url, publishableKey } = getPublicSupabaseEnv();
    const requester = createClient(url, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: isDpo, error: authorityError } = await requester.schema("core").rpc("is_active_admin", { required_role: "dpo" });
    if (authorityError || !isDpo) return Response.json({ status: "forbidden" }, { status: 403 });
    const databaseStartedAt = performance.now();
    const { count, error } = await supabase
      .schema("core")
      .from("datasets")
      .select("id", { count: "exact", head: true });
    const databaseResponseMs = Math.round(performance.now() - databaseStartedAt);

    if (error) {
      return Response.json({ status: "unavailable", apiResponseMs: Math.round(performance.now() - startedAt), databaseResponseMs }, { status: 503 });
    }

    return Response.json({ status: "ok", datasets: count ?? 0, apiResponseMs: Math.round(performance.now() - startedAt), databaseResponseMs, measuredAt: new Date().toISOString() });
  } catch {
    return Response.json({ status: "not_configured", apiResponseMs: Math.round(performance.now() - startedAt) }, { status: 503 });
  }
}
