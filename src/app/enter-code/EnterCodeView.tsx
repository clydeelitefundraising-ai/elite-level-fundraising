"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type TeamInfo = {
  campaign_slug: string;
  school_name:   string;
  mascot:        string;
  sport_name:    string;
  primary_color: string;
  athletes:      { id: string; name: string; event?: string }[];
};

type Step = "code" | "details" | "submitting";

export default function EnterCodeView({ loggedInName }: { loggedInName: string | null }) {
  const router = useRouter();

  const [step, setStep]             = useState<Step>("code");
  const [code, setCode]             = useState("");
  const [teamInfo, setTeamInfo]     = useState<TeamInfo | null>(null);
  const [role, setRole]             = useState<"athlete" | "parent" | "booster" | "">("");
  const [athleteId, setAthleteId]   = useState("");   // athlete role
  const [athleteIds, setAthleteIds] = useState<string[]>([]); // parent role — multiple kids
  const [name, setName]             = useState(loggedInName ?? "");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [error, setError]           = useState<string | null>(null);
  const [needsPasswordHint, setNeedsPasswordHint] = useState<"new" | "existing" | null>(null);
  const [looking, setLooking]       = useState(false);

  const toggleKid = (id: string) => {
    setAthleteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  async function findTeam(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLooking(true);
    try {
      const res  = await fetch(`/api/auth/validate-code?code=${encodeURIComponent(code.trim().toUpperCase())}`);
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

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!teamInfo || !role) return;
    if (role === "athlete" && !athleteId) { setError("Please select yourself from the roster."); return; }
    if (role === "parent" && athleteIds.length === 0) { setError("Please select at least one athlete."); return; }
    setError(null);
    setNeedsPasswordHint(null);
    setStep("submitting");
    try {
      const body: Record<string, unknown> = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        role,
      };
      if (!loggedInName) {
        body.email    = email.trim();
        body.password = password;
      }
      if (role === "athlete" && athleteId) body.athlete_id = athleteId;
      if (role === "parent"  && athleteIds.length > 0) body.athlete_ids = athleteIds;

      const res  = await fetch("/api/auth/join", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (data?.needsPassword) {
        setNeedsPasswordHint(data.existingAccount ? "existing" : "new");
        setStep("details");
        return;
      }
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
  const rosterEmpty        = needsAthleteSelect && !!teamInfo && teamInfo.athletes.length === 0;
  const canSubmit = role === "athlete" ? !!athleteId
    : role === "parent" ? athleteIds.length > 0
    : !!role;
  const isSubmitting       = step === "submitting";

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
                  {error === "Incorrect password." && (
                    <> — <a href="/request-reset" style={{ color: "#991b1b", fontWeight: 700 }}>Forgot password?</a></>
                  )}
                </div>
              )}

              {/* Role picker */}
              <div>
                <div style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".5rem" }}>
                  I am a…
                </div>
                <div style={{ display: "flex", gap: ".5rem" }}>
                  {(["athlete", "parent", "booster"] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => { setRole(r); setAthleteId(""); setAthleteIds([]); }}
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

              {/* Athlete select — single for athlete role, multi for parent (multiple kids) */}
              {rosterEmpty && (
                <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: ".5rem", padding: ".75rem 1rem", fontSize: ".85rem", color: "#991b1b" }}>
                  No athletes on the roster yet. Ask your coach to add the roster before joining.
                </div>
              )}

              {needsAthleteSelect && role === "athlete" && teamInfo.athletes.length > 0 && (
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
              )}

              {needsAthleteSelect && role === "parent" && teamInfo.athletes.length > 0 && (
                <div>
                  <span style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em" }}>
                    Select Athlete(s)
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: ".4rem", marginTop: ".4rem" }}>
                    {teamInfo.athletes.map(a => {
                      const active = athleteIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggleKid(a.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: ".6rem",
                            padding: ".65rem .75rem", borderRadius: ".5rem", textAlign: "left",
                            border: `1.5px solid ${active ? "#0b1e3d" : "#d1d5db"}`,
                            background: active ? "#eff0f3" : "#fff", cursor: "pointer",
                          }}
                        >
                          <span style={{
                            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                            border: `1.5px solid ${active ? "#0b1e3d" : "#d1d5db"}`,
                            background: active ? "#0b1e3d" : "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: ".65rem", color: "#fff",
                          }}>
                            {active ? "✓" : ""}
                          </span>
                          <span style={{ fontSize: ".9rem", color: "#111827" }}>
                            {a.name}{a.event ? ` (${a.event})` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Name (when not logged in) */}
              {!loggedInName && (
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
                    <span style={{ fontSize: ".78rem", color: "#9ca3af" }}>
                      Already have an ELF account? Enter your existing password instead — we&apos;ll add this team to it.
                    </span>
                  </label>
                </>
              )}

              {needsPasswordHint === "existing" && (
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: ".5rem", padding: ".75rem 1rem", fontSize: ".85rem", color: "#1d4ed8" }}>
                  We found your existing ELF account. Enter your password above to continue.
                </div>
              )}
              {needsPasswordHint === "new" && (
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: ".5rem", padding: ".75rem 1rem", fontSize: ".85rem", color: "#1d4ed8" }}>
                  Choose a password (at least 8 characters) to create your account.
                </div>
              )}

              {/* Logged-in identity confirmation */}
              {loggedInName && (
                <div style={{ background: "#fff", borderRadius: ".5rem", padding: ".75rem 1rem", fontSize: ".9rem", color: "#374151", border: "1.5px solid #d1d5db" }}>
                  Joining as <strong>{loggedInName}</strong>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !canSubmit || rosterEmpty}
                style={{
                  background: "#C4A35A",
                  color: "#0b1e3d",
                  fontWeight: 800,
                  fontSize: "1.05rem",
                  padding: "1rem",
                  borderRadius: ".75rem",
                  border: "none",
                  cursor: (isSubmitting || !canSubmit || rosterEmpty) ? "not-allowed" : "pointer",
                  opacity: (isSubmitting || !canSubmit || rosterEmpty) ? .6 : 1,
                }}
              >
                {isSubmitting ? "Joining…" : "Join Team →"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("code"); setTeamInfo(null); setRole(""); setAthleteId(""); setAthleteIds([]); setError(null); setNeedsPasswordHint(null); }}
                style={{ background: "none", border: "none", fontSize: ".88rem", color: "#6b7280", cursor: "pointer", textDecoration: "underline" }}
              >
                ← Try a different code
              </button>
            </form>
          )}
        </div>

        <div style={{ padding: "1rem", textAlign: "center" }}>
          <a href="/" style={{ fontSize: ".78rem", color: "#9ca3af", textDecoration: "none" }}>← Back to home</a>
        </div>
      </div>
    </div>
  );
}
