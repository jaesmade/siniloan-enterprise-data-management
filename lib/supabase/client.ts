"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseEnv } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  const { url, publishableKey } = getPublicSupabaseEnv();
  // Browsers may be on the LAN while Supabase is intentionally bound to the
  // host loopback interface. Proxy browser requests through Next so both
  // localhost and LAN clients use the same trusted application origin.
  const browserUrl = typeof window !== "undefined" ? `${window.location.origin}/supabase` : url;
  browserClient ??= createBrowserClient(browserUrl, publishableKey);
  return browserClient;
}
