"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseEnv } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  const { url, publishableKey } = getPublicSupabaseEnv();
  // Local Supabase is bound to loopback, so development browser traffic uses
  // Next's proxy. Hosted Supabase must be contacted directly in production.
  const browserUrl = process.env.NODE_ENV === "development" && typeof window !== "undefined"
    ? `${window.location.origin}/supabase`
    : url;
  browserClient ??= createBrowserClient(browserUrl, publishableKey);
  return browserClient;
}
