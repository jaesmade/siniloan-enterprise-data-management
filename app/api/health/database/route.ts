import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { count, error } = await supabase
      .schema("core")
      .from("datasets")
      .select("id", { count: "exact", head: true });

    if (error) {
      return Response.json({ status: "unavailable" }, { status: 503 });
    }

    return Response.json({ status: "ok", datasets: count ?? 0 });
  } catch {
    return Response.json({ status: "not_configured" }, { status: 503 });
  }
}
