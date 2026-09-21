"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseEnv } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  const { url, publishableKey } = getPublicSupabaseEnv();
  const isLocalBrowser = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const browserUrl = isLocalBrowser ? "http://127.0.0.1:54321" : url;
  browserClient ??= createBrowserClient(browserUrl, publishableKey);
  return browserClient;
}
