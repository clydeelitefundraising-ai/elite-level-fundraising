"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Clock, TriangleAlert } from "lucide-react";
import { authDisplayFont, authHandFont } from "@/components/auth/authDisplayFont";
import type { EntryPhoto } from "@/components/auth/entryPhotos";
import entryStyles from "@/components/auth/authEntry.module.css";
import styles from "./EnterCode.module.css";
import { buildParentJoinSummary, isFullyAlreadyMember, isTotalFailure, type ParentJoinResult } from "./parentJoinSummary";

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
  photo,
}: {
  loggedInName: string | null;
  initialCode:  string | null;
  photo:        EntryPhoto;
}) {
  const router = useRouter();

  const [step, setStep]           = useState<Step>("code");
  const [code, setCode]           = useState(initialCode ?? "");
  const [teamInfo, setTeamInfo]   = useState<TeamInfo | null>(null);
  const [role, setRole]           = useState<"athlete" | "parent" | "">("");
  const [athleteMode, setAthleteMode] = useState<"select" | "not_listed">("select");
  const [athleteId, setAthleteId] = useState("");
  // Parent role only (Family Relationships Phase C2) — the athlete role
  // keeps its existing single `athleteId` above, untouched.
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>([]);
  const [classYear, setClassYear] = useState("");
  const [event, setEvent]         = useState("");
  const [name, setName]           = useState(loggedInName ?? "");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [looking, setLooking]     = useState(false);
  // Parent multi-athlete submission summary, shown on the shared
  // pending_confirmation screen; the not-listed-athlete path never sets
  // this, so that screen's original hardcoded copy is unaffected.
  const [resultSummary, setResultSummary] = useState("");
  // True only when EVERY selected athlete failed — i.e. zero requests
  // actually exist after this submission. The not-listed-athlete path
  // never sets this (it only reaches pending_confirmation on success), so
  // it stays false there. Drives the confirmation screen's heading/icon/CTA
  // so a parent is never told "Request Sent" when nothing was sent.
  const [requestFailed, setRequestFailed] = useState(false);

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
    if (role === "parent" && selectedAthleteIds.length === 0) {
      setError("Please select at least one athlete.");
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
      const body: Record<string, unknown> = {
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
      if (role === "athlete" && athleteId) body.athlete_id = athleteId;
      if (role === "parent") body.athleteIds = selectedAthleteIds;

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

      if (role === "parent") {
        const results = (data as { results?: ParentJoinResult[] }).results ?? [];
        // Every selected athlete already had live approved access — the
        // generalized form of the original single-athlete alreadyMember
        // fast path, so go straight to the team instead of showing a
        // "request sent" screen for nothing that was actually requested.
        if (isFullyAlreadyMember(results)) {
          router.push(`/team/${(data as { campaign_slug: string }).campaign_slug}/home`);
          return;
        }
        const athleteNames = Object.fromEntries(teamInfo.athletes.map(a => [a.id, a.name]));
        setResultSummary(buildParentJoinSummary(results, athleteNames));
        setRequestFailed(isTotalFailure(results));
        setStep("pending_confirmation");
        return;
      }

      // Athlete role: access is immediate once validated (unchanged).
      router.push(`/team/${(data as { campaign_slug: string }).campaign_slug}/home`);
    } catch {
      setError("Network error. Please try again.");
      setStep("details");
    }
  }

  const isSubmitting       = step === "submitting";
  // Redundant-name rule: only athlete role selecting from the roster skips
  // the name field (identity comes from the roster pick). Parents and the
  // not-listed athlete path still need it.
  const showNameField = !loggedInName && !(role === "athlete" && athleteMode === "select");

  return (
    <div className={`${styles.page} ${authDisplayFont.variable} ${authHandFont.variable}`} style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className={styles.panel}>

        {/* Phase A36 mobile refinement — compact photo hero, hidden at
            1024px+ where the dark crown+text .header (below) takes over. */}
        <div className={entryStyles.mobileHero}>
          <div className={entryStyles.photoFill}>
            <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 1023px) 100vw, 0px" priority />
          </div>
          <div className={entryStyles.photoScrim} />
          <div className={entryStyles.mobileHeroContent}>
            <Image
              src="/auth/elf-team-logo.png"
              alt="ELF Team"
              width={1536}
              height={1024}
              className={entryStyles.mobileHeroLogo}
              priority
            />
          </div>
        </div>

        <div className={styles.header}>
          <Image
            src="/auth/elf-team-logo.png"
            alt="ELF Team"
            width={1536}
            height={1024}
            className={entryStyles.brandMarkCompact}
            style={{ flexShrink: 0 }}
            priority
          />
          <div className={styles.headerText}>
            <span className={styles.headerTitle}>Find Your Team</span>
            <span className={styles.headerSubtitle}>Connect with your coach&apos;s code</span>
          </div>
        </div>
        <div className={styles.accentDivider} />

        <div className={styles.body}>

          {/* Step 1: Code entry */}
          {step === "code" && (
            <form onSubmit={findTeam} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <h1 style={{ margin: 0, fontFamily: "var(--auth-font-display, inherit)", fontSize: "1.6rem", fontWeight: 400, color: "#121110" }}>Find Your Team</h1>
              <p style={{ margin: 0, fontSize: ".9rem", color: "#6b7280" }}>
                Enter the 6-character code from your coach.
              </p>

              {error && <div className={entryStyles.errorBox}>{error}</div>}

              <input
                type="text"
                placeholder="HAWKS2"
                maxLength={8}
                required
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                className={entryStyles.input}
                style={{
                  fontSize: "1.6rem",
                  fontWeight: 800,
                  textAlign: "center",
                  letterSpacing: ".2em",
                  textTransform: "uppercase",
                }}
              />

              <button
                type="submit"
                disabled={looking || code.trim().length < 4}
                className={entryStyles.primaryButton}
              >
                {looking ? "Searching…" : "Find Team →"}
              </button>

              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: ".88rem", color: "#6b7280" }}>Already have an account? </span>
                <a href="/login" style={{ fontSize: ".88rem", color: "var(--elf-orange-dark)", fontWeight: 700, textDecoration: "underline" }}>Log in</a>
              </div>
            </form>
          )}

          {/* Step 2: Team details + account info */}
          {(step === "details" || step === "submitting") && teamInfo && (
            <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

              {/* Team card */}
              <div style={{ background: teamInfo.primary_color || "var(--shell-backdrop)", borderRadius: ".75rem", padding: "1.25rem", color: "#fff" }}>
                <div style={{ fontWeight: 800, fontSize: "1.2rem" }}>{teamInfo.school_name}</div>
                <div style={{ fontSize: ".85rem", opacity: .85, marginTop: ".2rem" }}>
                  {[teamInfo.mascot, teamInfo.sport_name].filter(Boolean).join(" · ")}
                </div>
              </div>

              {error && <div className={entryStyles.errorBox}>{error}</div>}

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
                      onClick={() => { setRole(r); setAthleteId(""); setSelectedAthleteIds([]); setAthleteMode("select"); setError(null); }}
                      style={{
                        flex: 1,
                        padding: ".65rem .5rem",
                        borderRadius: ".5rem",
                        border: `2px solid ${role === r ? "var(--elf-orange)" : "#d1d5db"}`,
                        background: role === r ? "var(--elf-orange)" : "#fff",
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

              {/* Athlete select — athlete must either pick themself or
                  explicitly say they're not listed. Unchanged by Family
                  Relationships Phase C2. */}
              {role === "athlete" && athleteMode === "select" && (
                <div style={{ display: "flex", flexDirection: "column", gap: ".65rem" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                    <span style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em" }}>
                      Select Yourself
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

                  <button
                    type="button"
                    onClick={() => { setAthleteMode("not_listed"); setAthleteId(""); setError(null); }}
                    style={{
                      alignSelf: "flex-start",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: 44,
                      padding: ".55rem 1rem",
                      borderRadius: ".65rem",
                      border: "1.5px solid #d1d5db",
                      background: "#fff",
                      fontSize: ".82rem",
                      color: "var(--elf-orange-dark)",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    I don&apos;t see my name
                  </button>
                </div>
              )}

              {/* Parent multi-athlete select (Family Relationships Phase
                  C2) — one or more children in a single submission, each
                  becoming its own independent pending request (Phase 11a
                  schema unchanged: still one parent_access_requests row
                  per athlete). Plain checkboxes, not <select multiple>, so
                  selection state is obvious and the whole row is tappable
                  on mobile. Works identically for a one-athlete roster —
                  no separate "simple" code path needed. */}
              {role === "parent" && (
                <div
                  role="group"
                  aria-label="Select your child or children"
                  style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}
                >
                  <span style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em" }}>
                    Select Your Child{teamInfo.athletes.length > 1 ? "ren" : ""}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                    {teamInfo.athletes.map(a => {
                      const checked = selectedAthleteIds.includes(a.id);
                      return (
                        <label
                          key={a.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: ".65rem",
                            padding: ".75rem .9rem",
                            borderRadius: ".5rem",
                            border: `2px solid ${checked ? "var(--elf-orange)" : "#d1d5db"}`,
                            background: checked ? "var(--elf-orange)" : "#fff",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedAthleteIds(prev =>
                                prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id],
                              );
                              setError(null);
                            }}
                            style={{ width: 20, height: 20, flexShrink: 0, cursor: "pointer" }}
                          />
                          <span style={{ fontSize: ".95rem", fontWeight: 700, color: checked ? "#fff" : "#374151" }}>
                            {a.name}
                            {a.event ? <span style={{ fontWeight: 500, opacity: .85 }}> ({a.event})</span> : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
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
                disabled={isSubmitting || !role || (role === "parent" && selectedAthleteIds.length === 0)}
                className={entryStyles.primaryButton}
              >
                {isSubmitting ? "Submitting…" : isNotListed ? "Send Request →" : "Join Team →"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("code"); setTeamInfo(null); setRole(""); setAthleteMode("select"); setSelectedAthleteIds([]); setResultSummary(""); setRequestFailed(false); setError(null); }}
                style={{ background: "none", border: "none", fontSize: ".88rem", color: "#6b7280", cursor: "pointer", textDecoration: "underline" }}
              >
                ← Try a different code
              </button>
            </form>
          )}

          {/* Step 3: Pending confirmation (not-listed athlete request sent,
              or a parent multi-athlete submission). requestFailed is only
              ever true for the parent path, and only when EVERY selected
              athlete failed — i.e. nothing was actually submitted — so the
              heading/icon/CTA never claim a request was sent when none
              exists. */}
          {step === "pending_confirmation" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center", textAlign: "center", paddingTop: "2rem" }}>
              {requestFailed
                ? <TriangleAlert size={40} color="#dc2626" strokeWidth={1.75} />
                : <Clock size={40} color="var(--elf-orange-dark)" strokeWidth={1.75} />}
              <h1 style={{ margin: 0, fontFamily: "var(--auth-font-display, inherit)", fontSize: "1.4rem", fontWeight: 400, color: "#121110" }}>
                {requestFailed ? "Request Not Sent" : "Request Sent"}
              </h1>
              <p style={{ margin: 0, fontSize: ".9rem", color: "#6b7280", lineHeight: 1.5, maxWidth: 320 }}>
                {resultSummary || "Your request has been sent to the Head Coach for approval. You'll get team access once it's approved."}
              </p>
              {requestFailed ? (
                <button
                  type="button"
                  onClick={() => { setError(null); setStep("details"); }}
                  style={{ display: "inline-block", marginTop: ".5rem", background: "var(--elf-orange)", color: "#fff", padding: ".85rem 1.75rem", borderRadius: ".75rem", border: "none", fontWeight: 700, fontSize: ".95rem", cursor: "pointer" }}
                >
                  Try Again
                </button>
              ) : (
                <a
                  href="/teams"
                  style={{ display: "inline-block", marginTop: ".5rem", background: "var(--elf-orange)", color: "#fff", padding: ".85rem 1.75rem", borderRadius: ".75rem", textDecoration: "none", fontWeight: 700, fontSize: ".95rem" }}
                >
                  Go to My Teams
                </a>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "0 1.25rem 1.25rem", textAlign: "center" }}>
          <Link href="/" style={{ fontSize: ".78rem", color: "#9c9186", textDecoration: "none" }}>← Back to home</Link>
        </div>

        {/* Phase A36 — desktop-only editorial photo band, matching the same
            pattern used on /teams. Hidden below 1024px (EnterCode.module.css). */}
        <div className={styles.photoBand}>
          <div className={entryStyles.photoFill}>
            <Image src={photo.src} alt={photo.alt} fill sizes="560px" priority />
          </div>
          <div className={entryStyles.photoScrim} />
          <div className={entryStyles.photoContent} style={{ padding: "0 2rem 1.5rem" }}>
            <p className={entryStyles.handwritten} style={{ fontSize: "1.05rem", margin: 0 }}>
              Real teams. Real results.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
