"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { MARKETING_CONSENT_TEXT } from "@/lib/marketing/previewLead";
import { SAMPLE_NOTICE } from "./fixtures";

// The interactive sample fundraiser on /fundraising: the real public
// campaign page (with fictional data) in a phone or desktop frame, served
// by /preview/fundraiser.
//
// Lead gate: when `gateEnabled` (every server dependency is in place — see
// previewLeadReadiness), a full name + email unlock the preview; marketing
// consent is a separate, optional, unchecked box and never affects
// unlocking. The unlock is remembered in this browser only — a convenience,
// not a security boundary: the preview is fictional and public by design.
// When the gate is disabled the preview is simply shown.

const UNLOCK_KEY = "elf-fundraising-preview-unlocked";

function readUnlocked(): boolean {
  try {
    return window.localStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberUnlocked() {
  try {
    window.localStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    /* private mode / blocked storage: the preview still unlocks for this visit */
  }
}

export function FundraisingPreview({ gateEnabled }: { gateEnabled: boolean }) {
  const [unlocked, setUnlocked] = useState(!gateEnabled);
  const [view, setView] = useState<"team" | "athlete">("team");
  const [device, setDevice] = useState<"phone" | "desktop">("phone");

  useEffect(() => {
    // Restoring a remembered unlock from browser storage after mount — the
    // server render can't know it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (gateEnabled && readUnlocked()) setUnlocked(true);
  }, [gateEnabled]);

  return (
    <div className="mk-fp">
      <div className="mk-fp-toolbar">
        <span className="mk-fp-badge">Sample fundraiser · fictional team</span>
        <div className="mk-seg" role="group" aria-label="Page to preview">
          <button type="button" aria-pressed={view === "team"} onClick={() => setView("team")}>Team page</button>
          <button type="button" aria-pressed={view === "athlete"} onClick={() => setView("athlete")}>Athlete page</button>
        </div>
        <div className="mk-seg mk-seg-device" role="group" aria-label="Device">
          <button type="button" aria-pressed={device === "phone"} onClick={() => setDevice("phone")}>Phone</button>
          <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>Desktop</button>
        </div>
      </div>

      <div className={`mk-fp-stage mk-fp-stage-${device}`}>
        {unlocked ? (
          <div className={device === "phone" ? "mk-fp-phone" : "mk-fp-browser"}>
            {device === "desktop" && <div className="mk-browser-bar" aria-hidden="true"><span /><span /><span /></div>}
            <iframe
              key={view}
              src={`/preview/fundraiser?view=${view}`}
              title={`Sample fundraiser — ${view === "athlete" ? "athlete page" : "team page"} (fictional team, donations turned off)`}
              loading="lazy"
              className="mk-fp-frame"
            />
          </div>
        ) : (
          <PreviewGate onUnlocked={() => { rememberUnlocked(); setUnlocked(true); }} />
        )}
      </div>
      <p className="mk-fp-note">
        {SAMPLE_NOTICE} Try the leaderboard filters, search, the athlete page and the donation form &mdash;
        donations are turned off, so nothing is charged.
      </p>
    </div>
  );
}

function PreviewGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const id = useId();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrors({});
    setFormError(null);
    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/marketing/preview-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: String(data.get("fullName") || ""),
          email: String(data.get("email") || ""),
          marketingConsent: data.get("marketingConsent") === "on",
          website: String(data.get("website") || ""), // honeypot
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        onUnlocked();
        return;
      }
      if (res.status === 400 && json.errors) setErrors(json.errors);
      else setFormError(json.error || "Something went wrong. Please try again.");
      setStatus("error");
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
      setStatus("error");
    }
    requestAnimationFrame(() => alertRef.current?.focus());
  }

  const errorList = Object.values(errors);
  return (
    <div className="mk-gate">
      <div className="mk-gate-card">
        <h3>See the full sample fundraiser</h3>
        <p>Enter your name and email to explore a working ELF fundraiser for a fictional team.</p>
        {(formError || errorList.length > 0) && (
          <div className="mk-form-status mk-status-error" role="alert" tabIndex={-1} ref={alertRef}>
            <strong>{formError ?? "Please fix the following:"}</strong>
            {errorList.length > 0 && <ul>{errorList.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          </div>
        )}
        <form onSubmit={onSubmit} noValidate>
          <div className="mk-honeypot" aria-hidden="true">
            <label htmlFor={`${id}-website`}>Leave this field blank</label>
            <input type="text" id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
          </div>
          <div className="mk-field">
            <label htmlFor={`${id}-name`}>Full name <span className="mk-required">*</span></label>
            <input id={`${id}-name`} name="fullName" type="text" required autoComplete="name"
              aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? `${id}-name-err` : undefined} />
            {errors.fullName && <span className="mk-field-error" id={`${id}-name-err`}>{errors.fullName}</span>}
          </div>
          <div className="mk-field">
            <label htmlFor={`${id}-email`}>Email address <span className="mk-required">*</span></label>
            <input id={`${id}-email`} name="email" type="email" required autoComplete="email"
              aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${id}-email-err` : undefined} />
            {errors.email && <span className="mk-field-error" id={`${id}-email-err`}>{errors.email}</span>}
          </div>
          <label className="mk-consent" htmlFor={`${id}-consent`}>
            <input id={`${id}-consent`} name="marketingConsent" type="checkbox" defaultChecked={false} />
            <span>{MARKETING_CONSENT_TEXT} <em>(Optional)</em></span>
          </label>
          <button type="submit" className="mk-btn mk-btn-primary mk-btn-lg mk-btn-block" disabled={status === "submitting"}>
            {status === "submitting" ? "Unlocking…" : "Unlock the Preview"}
          </button>
          <p className="mk-form-note">
            We&rsquo;ll use your details to follow up about ELF. The preview unlocks whether or not you
            tick the box. See our <a href="/trust/privacy">Privacy Policy</a>.
          </p>
        </form>
      </div>
    </div>
  );
}
