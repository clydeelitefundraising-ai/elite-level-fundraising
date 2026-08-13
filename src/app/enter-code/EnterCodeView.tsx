"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

// Locally redeclared to match CampaignPageClient.tsx's established
// convention — lib/supabase.ts is server-only (reads
// SUPABASE_SERVICE_ROLE_KEY), unsafe to import into a client component.
const ATHLETE_CLASS_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior"] as const;

type TeamInfo = {
  campaign_slug: string;
  school_name:   string;
  mascot:        string;
  sport_name:    string;
  primary_color: string;
  athletes:      { id: string; name: string; event?: string }[];
};

type Step = "code" | "details" | "submitting" | "pending_confirmation";

export default function EnterCodeView({
  loggedInName,
  initialCode,
}: {
  loggedInName: string | null;
  initialCode:  string | null;
}) {
  const router = useRouter();

  const [step, setStep]           = useState<Step>("code");
  const [code, setCode]           = useState(initialCode ?? "");
  const [teamInfo, setTeamInfo]   = useState<TeamInfo | null>(null);
  const [role, setRole]           = useState<"athlete" | "parent" | "">("");
  const [athleteMode, setAthleteMode] = useState<"select" | "not_listed">("select");
  const [athleteId, setAthleteId] = useState("");
  const [classYear, setClassYear] = useState("");
  const [event, setEvent]         = useState("");
  const [name, setName]           = useState(loggedInName ?? "");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [looking, setLooking]     = useState(false);

  async function lookupTeam(codeToLookup: string) {
    setError(null);
    setLooking(true);
    try {
      const res  = await fetch(`/api/auth/validate-code?code=${encodeURIComponent(codeToLookup.trim().toUpperCase())}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Code not found."); return; }
      setTeamInfo(data as TeamInfo);
      setStep("details");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLooking(false);
    }
  }

  // Coach-shared /join/[code] links redirect here with ?code= prefilled —
  // skip straight to the team-specific step instead of making the user
  // retype the code. Fetch-on-mount is the correct use of an effect here;
  // matches the same pattern already present elsewhere in this codebase
  // (e.g. TeamNavWithBadge.tsx's message-count fetch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialCode) lookupTeam(initialCode);
  }, [initialCode]);

  async function findTeam(e: React.FormEvent) {
    e.preventDefault();
    await lookupTeam(code);
  }

  const selectedAthlete = teamInfo?.athletes.find(a => a.id === athleteId) ?? null;
  const isNotListed = role === "athlete" && athleteMode === "not_listed";

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!teamInfo || !role) return;

    if (role === "athlete" && athleteMode === "select" && !athleteId) {
      setError("Please select yourself from the roster, or choose \"I don't see my name.\"");
      return;
    }
    if (isNotListed && (!name.trim() || !classYear)) {
      setError("Full name and class/year are required.");
      return;
    }

    setError(null);
    setStep("submitting");
    try {
      if (isNotListed) {
        const body: Record<string, string> = {
          code: code.trim().toUpperCase(),
          name: name.trim(),
          classYear,
        };
        if (event.trim()) body.event = event.trim();
        if (!loggedInName) {
          body.email    = email.trim();
          body.password = password;
        }
        const res  = await fetch("/api/auth/join-request", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Request failed.");
          setStep("details");
          return;
        }
        setStep("pending_confirmation");
        return;
      }

      // role === "athlete" (roster selection) or "parent"
      const body: Record<string, string> = {
        code: code.trim().toUpperCase(),
        // Selecting yourself from the roster IS your identity — no
        // redundant separate name entry once an athlete is selected.
        name: role === "athlete" && selectedAthlete ? selectedAthlete.name : name.trim(),
        role,
      };
      if (!loggedInName) {
        body.email    = email.trim();
        body.password = password;
      }
      if (athleteId) body.athlete_id = athleteId;

      const res  = await fetch("/api/auth/join", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Join failed.");
        setStep("details");
        return;
      }
      router.push(`/team/${(data as { campaign_slug: string }).campaign_slug}/home`);
    } catch {
      setError("Network error. Please try again.");
      setStep("details");
    }
  }

  const needsAthleteSelect = role === "athlete" || role === "parent";
  const isSubmitting       = step === "submitting";
  // Redundant-name rule: only athlete role selecting from the roster skips
  // the name field (identity comes from the roster pick). Parents and the
  // not-listed athlete path still need it.
  const showNameField = !loggedInName && !(role === "athlete" && athleteMode === "select");

  return (
    <div style={{ minHeight: "100vh", background: "#0b1e3d", display: "flex", justifyContent: "center", alignItems: "flex-start", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 430, minHeight: "100vh", background: "#f5f6f8", display: "flex", flexDirection: "column" }}>

        <div style={{ background: "#0b1e3d", padding: "1.25rem 1rem", display: "flex", alignItems: "center", gap: ".75rem" }}>
          <Image src="/ELF.LOGO.png" alt="ELF" width={36} height={36} style={{ borderRadius: ".4rem" }} />
          <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.05rem" }}>Enter Team Code</span>
        </div>

        <div style={{ padding: "1.5rem 1.25rem", flex: 1, display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Step 1: Code entry */}
          {step === "code" && (
            <form onSubmit={findTeam} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d" }}>Find Your Team</h1>
              <p style={{ margin: 0, fontSize: ".9rem", color: "#6b7280" }}>
                Enter the 6-character code from your coach.
              </p>

              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: ".5rem", padding: ".75rem 1rem", fontSize: ".88rem", color: "#991b1b" }}>
                  {error}
                </div>
              )}

              <input
                type="text"
                placeholder="HAWKS2"
                maxLength={8}
                required
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                style={{
                  padding: "1rem",
                  borderRadius: ".5rem",
                  border: "1.5px solid #d1d5db",
                  fontSize: "1.6rem",
                  fontWeight: 800,
                  textAlign: "center",
                  letterSpacing: ".2em",
                  textTransform: "uppercase",
                  outline: "none",
                  background: "#fff",
                }}
              />

              <button
                type="submit"
                disabled={looking || code.trim().length < 4}
                style={{
                  background: "#C4A35A",
                  color: "#0b1e3d",
                  fontWeight: 800,
                  fontSize: "1.05rem",
                  padding: "1rem",
                  borderRadius: ".75rem",
                  border: "none",
                  cursor: (looking || code.trim().length < 4) ? "not-allowed" : "pointer",
                  opacity: (looking || code.trim().length < 4) ? .6 : 1,
                }}
              >
                {looking ? "Searching…" : "Find Team →"}
              </button>

              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: ".88rem", color: "#6b7280" }}>Already have an account? </span>
                <a href="/login" style={{ fontSize: ".88rem", color: "#0b1e3d", fontWeight: 700, textDecoration: "underline" }}>Log in</a>
              </div>
            </form>
          )}

          {/* Step 2: Team details + account info */}
          {(step === "details" || step === "submitting") && teamInfo && (
            <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

              {/* Team card */}
              <div style={{ background: teamInfo.primary_color || "#0b1e3d", borderRadius: ".75rem", padding: "1.25rem", color: "#fff" }}>
                <div style={{ fontWeight: 800, fontSize: "1.2rem" }}>{teamInfo.school_name}</div>
                <div style={{ fontSize: ".85rem", opacity: .85, marginTop: ".2rem" }}>
                  {[teamInfo.mascot, teamInfo.sport_name].filter(Boolean).join(" · ")}
                </div>
              </div>

              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: ".5rem", padding: ".75rem 1rem", fontSize: ".88rem", color: "#991b1b" }}>
                  {error}
                </div>
              )}

              {/* Role picker — Booster intentionally excluded (Phase 1B):
                  boosters are added only via Head-Coach staff management. */}
              <div>
                <div style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".5rem" }}>
                  I am a…
                </div>
                <div style={{ display: "flex", gap: ".5rem" }}>
                  {(["athlete", "parent"] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => { setRole(r); setAthleteId(""); setAthleteMode("select"); setError(null); }}
                      style={{
                        flex: 1,
                        padding: ".65rem .5rem",
                        borderRadius: ".5rem",
                        border: `2px solid ${role === r ? "#0b1e3d" : "#d1d5db"}`,
                        background: role === r ? "#0b1e3d" : "#fff",
                        color: role === r ? "#fff" : "#374151",
                        fontWeight: 700,
                        fontSize: ".88rem",
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Athlete select — required for role=athlete (never optional:
                  either pick yourself, or explicitly say you're not listed).
                  Optional for role=parent (existing behavior preserved). */}
              {needsAthleteSelect && athleteMode === "select" && (
                <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                    <span style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em" }}>
                      {role === "athlete" ? "Select Yourself" : "Select Athlete (optional)"}
                    </span>
                    <select
                      value={athleteId}
                      onChange={e => setAthleteId(e.target.value)}
                      style={{ padding: ".75rem 1rem", borderRadius: ".5rem", border: "1.5px solid #d1d5db", fontSize: ".95rem", background: "#fff", outline: "none" }}
                    >
                      <option value="">— Choose athlete —</option>
                      {teamInfo.athletes.map(a => (
                        <option key={a.id} value={a.id}>{a.name}{a.event ? ` (${a.event})` : ""}</option>
                      ))}
                    </select>
                  </label>

                  {role === "athlete" && (
                    <button
                      type="button"
                      onClick={() => { setAthleteMode("not_listed"); setAthleteId(""); setError(null); }}
                      style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, fontSize: ".82rem", color: "#0b1e3d", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}
                    >
                      I don&apos;t see my name
                    </button>
                  )}
                </div>
              )}

              {/* Not-listed athlete: request pending Head Coach approval */}
              {isNotListed && (
                <div style={{ display: "flex", flexDirection: "column", gap: ".75rem", background: "#fff", border: "1.5px solid #d1d5db", borderRadius: ".65rem", padding: ".9rem" }}>
                  <div style={{ fontSize: ".8rem", color: "#6b7280", lineHeight: 1.4 }}>
                    We&apos;ll send your info to the Head Coach for approval before you get team access.
                  </div>
                  <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                    <span style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em" }}>Full Name</span>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      style={{ padding: ".75rem 1rem", borderRadius: ".5rem", border: "1.5px solid #d1d5db", fontSize: "1rem", background: "#fff", outline: "none" }}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                    <span style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em" }}>Class / Year</span>
                    <select
                      value={classYear}
                      required
                      onChange={e => setClassYear(e.target.value)}
                      style={{ padding: ".75rem 1rem", borderRadius: ".5rem", border: "1.5px solid #d1d5db", fontSize: ".95rem", background: "#fff", outline: "none" }}
                    >
                      <option value="">Select class…</option>
                      {ATHLETE_CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                    <span style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em" }}>
                      Event <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#9ca3af" }}>optional</span>
                    </span>
                    <input
                      type="text"
                      value={event}
                      onChange={e => setEvent(e.target.value)}
                      placeholder="e.g. Sprints, Distance, Jumps"
                      style={{ padding: ".75rem 1rem", borderRadius: ".5rem", border: "1.5px solid #d1d5db", fontSize: "1rem", background: "#fff", outline: "none" }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => { setAthleteMode("select"); setError(null); }}
                    style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, fontSize: ".78rem", color: "#6b7280", textDecoration: "underline", cursor: "pointer" }}
                  >
                    ← Back to roster
                  </button>
                </div>
              )}

              {/* Name — only shown when it isn't redundant with a roster pick */}
              {showNameField && !isNotListed && (
                <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                  <span style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em" }}>Your Name</span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    style={{ padding: ".75rem 1rem", borderRadius: ".5rem", border: "1.5px solid #d1d5db", fontSize: "1rem", background: "#fff", outline: "none" }}
                  />
                </label>
              )}

              {/* Email + password (when not logged in) */}
              {!loggedInName && (
                <>
                  <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                    <span style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em" }}>Email</span>
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      style={{ padding: ".75rem 1rem", borderRadius: ".5rem", border: "1.5px solid #d1d5db", fontSize: "1rem", background: "#fff", outline: "none" }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                    <span style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em" }}>Password</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      style={{ padding: ".75rem 1rem", borderRadius: ".5rem", border: "1.5px solid #d1d5db", fontSize: "1rem", background: "#fff", outline: "none" }}
                    />
                    <span style={{ fontSize: ".78rem", color: "#9ca3af" }}>At least 8 characters</span>
                  </label>
                </>
              )}

              {/* Logged-in identity confirmation */}
              {loggedInName && !isNotListed && (
                <div style={{ background: "#fff", borderRadius: ".5rem", padding: ".75rem 1rem", fontSize: ".9rem", color: "#374151", border: "1.5px solid #d1d5db" }}>
                  Joining as <strong>{role === "athlete" && selectedAthlete ? selectedAthlete.name : loggedInName}</strong>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !role}
                style={{
                  background: "#C4A35A",
                  color: "#0b1e3d",
                  fontWeight: 800,
                  fontSize: "1.05rem",
                  padding: "1rem",
                  borderRadius: ".75rem",
                  border: "none",
                  cursor: (isSubmitting || !role) ? "not-allowed" : "pointer",
                  opacity: (isSubmitting || !role) ? .6 : 1,
                }}
              >
                {isSubmitting ? "Submitting…" : isNotListed ? "Send Request →" : "Join Team →"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("code"); setTeamInfo(null); setRole(""); setAthleteMode("select"); setError(null); }}
                style={{ background: "none", border: "none", fontSize: ".88rem", color: "#6b7280", cursor: "pointer", textDecoration: "underline" }}
              >
                ← Try a different code
              </button>
            </form>
          )}

          {/* Step 3: Pending confirmation (not-listed athlete request sent) */}
          {step === "pending_confirmation" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center", textAlign: "center", paddingTop: "2rem" }}>
              <div style={{ fontSize: "2.5rem" }}>⏳</div>
              <h1 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "#0b1e3d" }}>Request Sent</h1>
              <p style={{ margin: 0, fontSize: ".9rem", color: "#6b7280", lineHeight: 1.5, maxWidth: 320 }}>
                Your request has been sent to the Head Coach for approval. You&apos;ll get team access once it&apos;s approved.
              </p>
              <a
                href="/teams"
                style={{ display: "inline-block", marginTop: ".5rem", background: "#0b1e3d", color: "#fff", padding: ".85rem 1.75rem", borderRadius: ".75rem", textDecoration: "none", fontWeight: 700, fontSize: ".95rem" }}
              >
                Go to My Teams
              </a>
            </div>
          )}
        </div>

        <div style={{ padding: "1rem", textAlign: "center" }}>
          <a href="/" style={{ fontSize: ".78rem", color: "#9ca3af", textDecoration: "none" }}>← Back to home</a>
        </div>
      </div>
    </div>
  );
}
