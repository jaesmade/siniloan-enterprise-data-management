import "server-only";

import { createHash } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

type RateLimitResult = { allowed: boolean; remaining: number; retry_after_seconds: number };

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const requestHost = forwardedHost || request.headers.get("host") || new URL(request.url).host;
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

export function requestFingerprint(request: Request, discriminator = "") {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${address}|${discriminator.toLowerCase()}`).digest("hex");
}

export async function checkRateLimit(scope: string, keyHash: string, limit: number, windowSeconds: number) {
  const admin = createAdminClient();
  const { data, error } = await admin.schema("core").rpc("check_rate_limit", {
    p_scope: scope,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  const result = (Array.isArray(data) ? data[0] : data) as RateLimitResult | null;
  if (!result) throw new Error("Rate limiter returned no result.");
  return result;
}

export function rateLimitHeaders(result: RateLimitResult, limit: number) {
  return {
    "Cache-Control": "no-store",
    "Retry-After": String(Math.max(1, result.retry_after_seconds)),
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
  };
}
