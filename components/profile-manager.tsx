"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, EnvelopeSimple, Key, ShieldCheck, SpinnerGap, X } from "@phosphor-icons/react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

type Profile = { full_name: string; username: string; email: string; role: string };

export function ProfileManager({ profile, passwordRecovery, onClose, onRecoveryComplete }: {
  profile: Profile;
  passwordRecovery: boolean;
  onClose: () => void;
  onRecoveryComplete: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const initials = profile.full_name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog?.addEventListener("keydown", keepFocusInside);
    return () => {
      dialog?.removeEventListener("keydown", keepFocusInside);
      const profileTrigger = document.querySelector<HTMLButtonElement>(".profile-trigger");
      if (profileTrigger) profileTrigger.focus();
      else if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const sendVerification = async () => {
    setSending(true); setError(""); setNotice("");
    try {
      const { error: resetError } = await createSupabaseClient().auth.resetPasswordForEmail(profile.email, {
        redirectTo: window.location.origin + "/?action=profile-password",
      });
      if (resetError) setError(resetError.message);
      else setNotice("A secure reset link was sent to " + profile.email + ". Open it to verify your email and choose a new password.");
    } catch {
      setError("The verification email could not be sent. Check your connection and try again.");
    } finally { setSending(false); }
  };

  const updatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setNotice("");
    if (password.length < 12) { setError("Use at least 12 characters."); return; }
    if (password !== confirmPassword) { setError("The passwords do not match."); return; }
    setUpdating(true);
    try {
      const { error: updateError } = await createSupabaseClient().auth.updateUser({ password });
      if (updateError) { setError(updateError.message); return; }
      setPassword(""); setConfirmPassword(""); setPasswordUpdated(true);
      window.history.replaceState({}, "", window.location.pathname);
      onRecoveryComplete();
    } catch {
      setError("Your password could not be updated. The recovery link may have expired.");
    } finally { setUpdating(false); }
  };

  return <div className="modal-backdrop profile-manager-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="profile-manager panel" role="dialog" aria-modal="true" aria-labelledby="profile-manager-title" aria-describedby="profile-manager-description">
      <header className="profile-manager-header">
        <div><h2 id="profile-manager-title">Your profile</h2><p id="profile-manager-description">Account details and password settings.</p></div>
        <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="Close profile"><X /></button>
      </header>

      <section className="profile-identity" aria-label="Account identity">
        <span className="profile-manager-avatar" aria-hidden="true">{initials}</span>
        <div className="profile-identity-copy"><strong>{profile.full_name}</strong><span>@{profile.username}</span></div>
        <span className="badge badge-neutral profile-role">{profile.role}</span>
      </section>

      <div className="profile-email-row">
        <EnvelopeSimple aria-hidden="true" />
        <div><span>Email address</span><strong>{profile.email}</strong></div>
      </div>

      <section className="profile-password-section" aria-labelledby="profile-password-title">
        <header className="profile-password-heading">
          <span className="profile-password-icon"><Key /></span>
          <div><h3 id="profile-password-title">Password &amp; security</h3><p>Keep your account sign-in secure.</p></div>
        </header>

        {passwordUpdated ? <div className="profile-password-success" role="status">
          <div><CheckCircle /><span><strong>Password updated</strong><small>Your new password is ready to use the next time you sign in.</small></span></div>
          <button className="button secondary" type="button" onClick={onClose}>Done</button>
        </div> : passwordRecovery ? <>
          <div className="profile-verified"><ShieldCheck /><span>Email verified</span></div>
          <p className="profile-password-copy">Choose a new password for your account.</p>
          <form className="profile-password-form" onSubmit={updatePassword}>
            <label>New password<input type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <p className="profile-password-hint">Use at least 12 characters.</p>
            <label>Confirm new password<input type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
            <button className="button primary" type="submit" disabled={updating}>{updating ? <><SpinnerGap className="spin" /> Updating…</> : "Update password"}</button>
          </form>
        </> : <>
          <p className="profile-password-copy">We’ll verify your email before letting you change your password. We’ll send a secure, one use link to the address above.</p>
          <button className="button primary" type="button" onClick={sendVerification} disabled={sending}>{sending ? <><SpinnerGap className="spin" /> Sending link…</> : <><EnvelopeSimple /> Verify email and reset password</>}</button>
        </>}

        {notice && <p className="profile-manager-notice" role="status"><CheckCircle /> <span>{notice}</span></p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </section>
  </div>;
}

