import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { AccessMode, CurrentPrincipal, DatasetGrant, DatasetSlug } from "./types";

export class AuthorizationError extends Error {
  constructor(message = "You do not have access to this resource.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function getCurrentPrincipal(): Promise<CurrentPrincipal | null> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) return null;

  const { data: profile, error: profileError } = await supabase
    .schema("core")
    .from("profiles")
    .select("id, full_name, username, email, role, status, department_id")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile) return null;

  return {
    id: profile.id,
    fullName: profile.full_name,
    username: profile.username,
    email: profile.email,
    role: profile.role,
    status: profile.status,
    departmentId: profile.department_id,
  } as CurrentPrincipal;
}

export async function requireDatasetAccess(
  datasetSlug: DatasetSlug,
  requiredAccess: AccessMode = "read_only",
): Promise<{ principal: CurrentPrincipal; grant: DatasetGrant | null }> {
  const principal = await getCurrentPrincipal();
  if (!principal || principal.status !== "active") throw new AuthorizationError();
  if (principal.role === "dpo") return { principal, grant: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("core")
    .from("user_dataset_grants")
    .select("dataset_id, access_mode, department_scope_id, datasets!inner(slug)")
    .eq("user_id", principal.id)
    .eq("datasets.slug", datasetSlug)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data || (requiredAccess === "read_write" && data.access_mode !== "read_write")) {
    throw new AuthorizationError();
  }

  return {
    principal,
    grant: {
      datasetId: data.dataset_id,
      datasetSlug,
      accessMode: data.access_mode,
      departmentScopeId: data.department_scope_id,
    } as DatasetGrant,
  };
}
