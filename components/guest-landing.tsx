"use client";

import { ArrowRight } from "@phosphor-icons/react";

export function Landing({ onRequest, onSignIn }: { onRequest: () => void; onSignIn: () => void }) {
  return <main className="guest-landing">
    <div className="guest-landing-brand"><span className="seal"><span>S</span></span><span>Municipality of Siniloan<br/><strong>Enterprise Data Management</strong></span></div>
    <section><h1>Request municipal data</h1><p>Submit a data or interview request for review by the municipal Data Protection Officer. Staff can sign in to their assigned workspace.</p><div className="guest-actions"><button className="button primary" onClick={onRequest}>Request data <ArrowRight/></button><button className="button secondary" onClick={onSignIn}>Staff sign in</button></div></section>
    <footer>Requests are reviewed before any data is released.</footer>
  </main>;
}
