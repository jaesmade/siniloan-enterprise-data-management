
"use client";

import { useState } from "react";
import { Check, Copy, Key, SpinnerGap, X } from "@phosphor-icons/react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

export function AccountPasswordReset({ userId, fullName }: { userId: string; fullName: string }) {
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true); setError(""); setPassword(""); setCopied(false);
    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired. Sign in again.");
      const response = await fetch("/api/accounts/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The password could not be reset.");
      setPassword(String(result.password));
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "The password could not be reset.");
    } finally { setBusy(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(password); setCopied(true); }
    catch { setError("Copy was unavailable. Select and copy the password from the field."); }
  };

  return <section className="account-password-reset">
    <div className="account-password-reset-copy"><Key /><div><strong>Reset this account’s password</strong><p>Generate a random temporary password for {fullName}. Share it through a secure channel.</p></div></div>
    {!password ? <button className="button secondary" type="button" disabled={busy} onClick={generate}>{busy ? <><SpinnerGap className="spin" /> Generating…</> : "Generate temporary password"}</button> : <div className="generated-password" role="status"><label>New temporary password<input value={password} readOnly onFocus={(event) => event.currentTarget.select()} /></label><button className="button secondary" type="button" onClick={copy}>{copied ? <><Check /> Copied</> : <><Copy /> Copy password</>}</button><button className="icon-button" type="button" aria-label="Dismiss generated password" onClick={() => setPassword("")}><X /></button><small>This password is shown once. The user should change it after signing in.</small></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

