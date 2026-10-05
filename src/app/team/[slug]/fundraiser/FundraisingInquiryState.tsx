"use client";

import { useEffect, useState } from "react";
import { HandCoins } from "lucide-react";

type Phase = "checking" | "idle" | "submitting" | "sent" | "already-requested" | "error";

/** Phase F1b — rendered instead of the normal coach fundraiser dashboard
 *  when fundraising_enabled is false for this team (see page.tsx's
 *  server-side gate). Deliberately shows no fundraiser data of any kind
 *  (no $0 raised, no empty leaderboard, no donation controls, no goal/
 *  progress, no athlete analytics) — this is a feature-not-yet-on state,
 *  not a degraded version of the dashboard. Checks for an existing active
 *  inquiry on mount so a coach who already asked doesn't see an
 *  encouragement to ask again, even across page reloads/different
 *  sessions on the same team. */
export default function FundraisingInquiryState({ slug }: { slug: string }) {
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/team/${slug}/fundraising-inquiries`)
      .then(r => r.ok ? r.json() : { inquiry: null })
      .then(d => { if (!cancelled) setPhase(d?.inquiry ? "already-requested" : "idle"); })
      .catch(() => { if (!cancelled) setPhase("idle"); });
    return () => { cancelled = true; };
  }, [slug]);

  async function submitInquiry() {
    setPhase("submitting");
    try {
      const res = await fetch(`/api/team/${slug}/fundraising-inquiries`, { method: "POST" });
      if (!res.ok) { setPhase("error"); return; }
      const data = await res.json();
      setPhase(data?.created ? "sent" : "already-requested");
    } catch {
      setPhase("error");
    }
  }

  return (
    <div style={{
      background: "var(--surface-light)",
      borderRadius: 14,
      border: "1px solid var(--border-app)",
      padding: "2.5rem 1.75rem",
      textAlign: "center",
      maxWidth: 440,
      margin: "2rem auto",
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        background: "var(--surface-light-elevated)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 1.1rem",
      }}>
        <HandCoins size={24} strokeWidth={2} style={{ color: "var(--team-primary)" }} />
      </div>

      <h2 style={{ margin: "0 0 .5rem", fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary-app)" }}>
        Ready to fund your season?
      </h2>
      <p style={{ margin: "0 0 1.5rem", fontSize: ".88rem", color: "var(--text-muted-app)", lineHeight: 1.55 }}>
        ELF can help your program raise money without changing how you manage your team.
      </p>

      {phase === "already-requested" || phase === "sent" ? (
        <div>
          <button
            type="button"
            disabled
            style={{
              padding: ".75rem 1.5rem",
              borderRadius: 10,
              border: "1px solid var(--border-app)",
              background: "var(--surface-light-elevated)",
              color: "var(--text-muted-app)",
              fontWeight: 700,
              fontSize: ".88rem",
              cursor: "default",
            }}
          >
            Request Sent
          </button>
          <p style={{ margin: ".75rem 0 0", fontSize: ".78rem", color: "var(--text-muted-app)" }}>
            We&rsquo;ll be in touch about setting up fundraising for your team.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={submitInquiry}
          disabled={phase === "checking" || phase === "submitting"}
          style={{
            padding: ".75rem 1.75rem",
            borderRadius: 10,
            border: "none",
            background: "var(--team-primary)",
            color: "var(--team-primary-foreground)",
            fontWeight: 700,
            fontSize: ".88rem",
            cursor: phase === "checking" || phase === "submitting" ? "default" : "pointer",
            opacity: phase === "checking" || phase === "submitting" ? .7 : 1,
          }}
        >
          {phase === "submitting" ? "Sending…" : "Inquire About Fundraising"}
        </button>
      )}

      {phase === "error" && (
        <p style={{ margin: ".75rem 0 0", fontSize: ".78rem", color: "var(--color-error, #dc2626)" }}>
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  );
}
