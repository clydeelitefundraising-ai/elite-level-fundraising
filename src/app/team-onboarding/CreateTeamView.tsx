"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SchoolField from "./SchoolField";
import SportField from "./SportField";
import SeasonField from "./SeasonField";
import { defaultSeasonOption } from "./seasonOptions";
import { primaryButtonStyle, secondaryButtonStyle, formErrorBannerStyle } from "./formStyles";

type Stage = "form" | "review";
type FieldErrors = { schoolName?: string; sportName?: string; season?: string };

// Phase O3 — the entire Create Team flow for an already-authenticated ELF
// account. Calls O2's existing POST /api/team-onboarding/create exactly as
// built — no new provisioning path, no second endpoint.
export default function CreateTeamView({ accountName }: { accountName: string }) {
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("form");
  const [schoolName, setSchoolName] = useState("");
  const [sportName, setSportName] = useState("");
  const [season, setSeason] = useState(defaultSeasonOption(new Date().getFullYear()));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [submitting, setSubmitting] = useState(false);
  // Set (and left true) the instant a successful response arrives, before
  // router.push resolves — keeps Create Team permanently disabled through
  // navigation so a slow route transition can never leave it clickable
  // again for a stray second click.
  const [navigating, setNavigating] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Accessibility: move focus to the new stage's own heading whenever the
  // stage changes, so a keyboard/screen-reader user isn't left focused on
  // a button that just disappeared (Continue/Back) with no indication the
  // page content changed underneath them.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [stage]);

  function validateStage1(): boolean {
    const errors: FieldErrors = {};
    if (!schoolName.trim()) errors.schoolName = "School is required.";
    if (!sportName.trim())  errors.sportName  = "Sport is required.";
    if (!season)            errors.season     = "Season is required.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleContinue() {
    if (!validateStage1()) return;
    // Normalize whitespace before the review step ever displays these —
    // the review stage and the eventual POST body both read these same
    // trimmed values.
    setSchoolName(s => s.trim());
    setSportName(s => s.trim());
    setStage("review");
  }

  async function handleCreate() {
    setSubmitting(true);
    setSubmitError("");

    let res: Response;
    try {
      res = await fetch("/api/team-onboarding/create", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ schoolName, sportName, season }),
      });
    } catch {
      setSubmitError("Something went wrong creating your team. Please try again.");
      setSubmitting(false);
      return;
    }

    const data = await res.json().catch(() => null);

    if (res.ok && data?.ok) {
      setNavigating(true);
      router.push(`/team/${data.campaign_slug}/home`);
      return; // stay disabled through navigation — no finally reset below
    }

    if (res.status === 401) {
      router.push("/login");
      return;
    }

    if (res.status === 400) {
      const fieldMessage = data?.errors ? (Object.values(data.errors)[0] as string) : null;
      setSubmitError(fieldMessage || data?.error || "Please check your team information and try again.");
    } else if (res.status === 409) {
      setSubmitError(data?.error || "A team with this school, sport, and season already exists.");
    } else if (res.status === 429) {
      setSubmitError(data?.error || "You've created several teams recently. Please try again later.");
    } else {
      // Covers 500 and anything else — never surface raw backend/DB text.
      setSubmitError("Something went wrong creating your team. Please try again.");
    }
    setSubmitting(false);
  }

  const busy = submitting || navigating;

  return (
    <div style={{ minHeight: "100vh", background: "var(--shell-backdrop)", display: "flex", justifyContent: "center", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 430, minHeight: "100vh", background: "#f5f6f8", display: "flex", flexDirection: "column" }}>

        <div style={{ background: "var(--shell-backdrop)", color: "#fff", padding: "1.25rem 1.25rem 1rem" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem" }}>ELF Team</div>
          <div style={{ fontSize: ".78rem", color: "rgba(255,255,255,.6)", marginTop: ".15rem" }}>
            Hi {accountName.split(" ")[0]}
          </div>
        </div>
        <div style={{ height: 3, background: "var(--elf-orange)" }} />

        <div style={{ flex: 1, padding: "1.75rem 1.25rem 2rem" }}>
          {stage === "form" ? (
            <>
              <h1 ref={headingRef} tabIndex={-1} style={{ margin: "0 0 .4rem", fontSize: "1.3rem", fontWeight: 800, color: "var(--text-primary-app, #121110)", outline: "none" }}>
                Create Your Team
              </h1>
              <p style={{ margin: "0 0 1.5rem", fontSize: ".85rem", color: "var(--text-muted-app, #6b7280)", lineHeight: 1.5 }}>
                Set up your team in just a few steps. You can customize everything else later.
              </p>

              <SchoolField value={schoolName} onChange={setSchoolName} error={fieldErrors.schoolName} />
              <SportField  value={sportName}  onChange={setSportName}  error={fieldErrors.sportName} />
              <SeasonField value={season}     onChange={setSeason}     error={fieldErrors.season} />

              <button type="button" onClick={handleContinue} style={{ ...primaryButtonStyle, marginTop: ".5rem" }}>
                Continue
              </button>
            </>
          ) : (
            <>
              <h1 ref={headingRef} tabIndex={-1} style={{ margin: "0 0 .4rem", fontSize: "1.3rem", fontWeight: 800, color: "var(--text-primary-app, #121110)", outline: "none" }}>
                Review Your Team
              </h1>
              <p style={{ margin: "0 0 1.5rem", fontSize: ".85rem", color: "var(--text-muted-app, #6b7280)", lineHeight: 1.5 }}>
                Make sure everything looks right before you create your team.
              </p>

              <div style={{ background: "#fff", borderRadius: "1.1rem", border: "1px solid var(--border-app, #e5e7eb)", boxShadow: "0 3px 12px rgba(11,30,61,.08)", padding: "1.1rem 1.25rem", marginBottom: "1.5rem" }}>
                {[
                  { label: "School", value: schoolName },
                  { label: "Sport",  value: sportName },
                  { label: "Season", value: season },
                ].map((row, i, arr) => (
                  <div key={row.label} style={{ paddingBottom: i < arr.length - 1 ? ".85rem" : 0, marginBottom: i < arr.length - 1 ? ".85rem" : 0, borderBottom: i < arr.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                    <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em" }}>
                      {row.label}
                    </div>
                    <div style={{ fontSize: ".98rem", fontWeight: 700, color: "var(--text-primary-app, #121110)", marginTop: ".2rem" }}>
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>

              {submitError && (
                <p role="alert" style={formErrorBannerStyle}>{submitError}</p>
              )}

              <div style={{ display: "flex", gap: ".65rem" }}>
                <button
                  type="button"
                  onClick={() => setStage("form")}
                  disabled={busy}
                  style={{ ...secondaryButtonStyle, opacity: busy ? .6 : 1 }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={busy}
                  aria-busy={busy}
                  style={{ ...primaryButtonStyle, opacity: busy ? .7 : 1, cursor: busy ? "default" : "pointer" }}
                >
                  {busy ? "Creating…" : "Create Team"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
