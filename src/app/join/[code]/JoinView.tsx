"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CampaignSettings } from "@/lib/supabase";
import type { TeamAthleteRow } from "@/lib/teamData";

type Props = {
  code: string;
  campaignSlug: string;
  settings: CampaignSettings;
  athletes: TeamAthleteRow[];
};

const LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: ".3rem",
  fontSize: ".72rem",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

const INPUT_STYLE: React.CSSProperties = {
  padding: ".55rem .75rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: 8,
  fontSize: ".9rem",
  width: "100%",
  boxSizing: "border-box",
  color: "#111827",
  background: "#fff",
  outline: "none",
};

// Steps: role -> select athlete(s) (+ lightweight confirm) -> account -> done
type Step = "role" | "athletes" | "confirm" | "account";

export default function JoinView({ code, campaignSlug, settings, athletes }: Props) {
  const router = useRouter();
  const primary = settings.primary_color ?? "#0b1e3d";

  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<"athlete" | "parent" | "">("");
  const [athleteId, setAthleteId] = useState("");          // athlete role: self
  const [athleteIds, setAthleteIds] = useState<string[]>([]); // parent role: kids
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsPasswordHint, setNeedsPasswordHint] = useState<"new" | "existing" | null>(null);

  const filteredAthletes = athletes.filter(a =>
    !search.trim() || a.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const selectedSelf   = athletes.find(a => a.id === athleteId);
  const selectedKids   = athletes.filter(a => athleteIds.includes(a.id));

  const toggleKid = (id: string) => {
    setAthleteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const canProceedFromAthletes = role === "athlete" ? !!athleteId : athleteIds.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim())  { setError("Your name is required."); return; }
    if (!email.trim()) { setError("Email is required."); return; }
    if (!password)      { setError("Password is required."); return; }

    setLoading(true);
    setError("");
    setNeedsPasswordHint(null);

    const res = await fetch(`/api/auth/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        athlete_id:  role === "athlete" ? athleteId : undefined,
        athlete_ids: role === "parent"  ? athleteIds : undefined,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (data?.needsPassword) {
      setNeedsPasswordHint(data.existingAccount ? "existing" : "new");
      return;
    }

    if (!res.ok) {
      setError(data.error ?? "Failed to join. Please try again.");
      return;
    }

    router.push(`/team/${campaignSlug}/home`);
  };

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0b1e3d",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        background: "#fff",
        borderRadius: 16,
        padding: "2.25rem 2rem",
        boxShadow: "0 4px 24px rgba(0,0,0,.18)",
      }}>
        {/* Team branding */}
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: primary,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.3rem", marginBottom: "1rem",
        }}>
          🏆
        </div>
        <h1 style={{ margin: "0 0 .25rem", fontSize: "1.3rem", fontWeight: 800, color: "#0b1e3d" }}>
          Join {settings.school_name}
        </h1>
        <p style={{ margin: "0 0 1.75rem", fontSize: ".85rem", color: "#6b7280" }}>
          {settings.sport_name} · Code: <strong style={{ color: "#374151" }}>{code}</strong>
        </p>

        {/* ── Step: role ── */}
        {step === "role" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
            <div>
              <p style={{ margin: "0 0 .5rem", fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".05em" }}>
                I am a…
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".6rem" }}>
                {(["athlete", "parent"] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { setRole(r); setAthleteId(""); setAthleteIds([]); }}
                    style={{
                      padding: ".75rem .5rem",
                      border: `2px solid ${role === r ? primary : "#e5e7eb"}`,
                      borderRadius: 10,
                      background: role === r ? `${primary}18` : "#fff",
                      color: role === r ? primary : "#6b7280",
                      fontWeight: role === r ? 700 : 500,
                      fontSize: ".875rem",
                      cursor: "pointer",
                    }}
                  >
                    {r === "athlete" ? "🏃 Athlete" : "👨‍👩‍👧 Parent"}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              disabled={!role}
              onClick={() => setStep("athletes")}
              style={{
                padding: ".65rem", background: role ? primary : "#9ca3af", color: "#fff",
                border: "none", borderRadius: 9, fontSize: ".9rem", fontWeight: 700,
                cursor: role ? "pointer" : "not-allowed",
              }}
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Step: select athlete(s) from roster ── */}
        {step === "athletes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ margin: 0, fontSize: ".85rem", color: "#374151" }}>
              {role === "athlete" ? "Which roster entry is you?" : "Select your athlete(s):"}
            </p>

            {athletes.length > 4 && (
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search roster…"
                style={INPUT_STYLE}
              />
            )}

            {athletes.length === 0 ? (
              <p style={{ margin: 0, fontSize: ".82rem", color: "#9ca3af", fontStyle: "italic" }}>
                No athletes on the roster yet. Ask your coach to add the roster before joining.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: ".4rem", maxHeight: 260, overflowY: "auto" }}>
                {filteredAthletes.map(a => {
                  const active = role === "athlete" ? athleteId === a.id : athleteIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => role === "athlete" ? setAthleteId(a.id) : toggleKid(a.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: ".6rem",
                        padding: ".6rem .7rem", borderRadius: 9,
                        border: `1.5px solid ${active ? primary : "#e5e7eb"}`,
                        background: active ? `${primary}12` : "#fff",
                        cursor: "pointer", textAlign: "left",
                      }}
                    >
                      {role === "parent" && (
                        <span style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: `1.5px solid ${active ? primary : "#d1d5db"}`,
                          background: active ? primary : "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: ".65rem", color: "#fff",
                        }}>
                          {active ? "✓" : ""}
                        </span>
                      )}
                      <span style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600, fontSize: ".85rem", color: "#111827" }}>{a.name}</span>
                        {(a.class_year || a.event) && (
                          <span style={{ marginLeft: ".4rem", fontSize: ".72rem", color: "#9ca3af" }}>
                            {a.class_year || a.event}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {error && (
              <p style={{ margin: 0, padding: ".5rem .7rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: ".5rem" }}>
              <button type="button" onClick={() => setStep("role")}
                style={{ padding: ".6rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
                Back
              </button>
              <button
                type="button"
                disabled={!canProceedFromAthletes}
                onClick={() => setStep("confirm")}
                style={{
                  flex: 1, padding: ".6rem 1rem",
                  background: canProceedFromAthletes ? primary : "#9ca3af", color: "#fff",
                  border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 700,
                  cursor: canProceedFromAthletes ? "pointer" : "not-allowed",
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Step: lightweight confirm ── */}
        {step === "confirm" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ margin: 0, fontSize: ".85rem", color: "#374151" }}>
              {role === "athlete" ? "Confirm this is you:" : "Confirm your athlete(s):"}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
              {(role === "athlete" ? (selectedSelf ? [selectedSelf] : []) : selectedKids).map(a => (
                <div key={a.id} style={{ padding: ".6rem .75rem", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 9 }}>
                  <div style={{ fontWeight: 700, fontSize: ".85rem", color: "#111827" }}>{a.name}</div>
                  {(a.class_year || a.event) && (
                    <div style={{ fontSize: ".72rem", color: "#9ca3af" }}>{a.class_year || a.event}</div>
                  )}
                </div>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: ".76rem", color: "#9ca3af" }}>
              Not right? Go back and pick again — each roster spot can only be claimed once.
            </p>
            <div style={{ display: "flex", gap: ".5rem" }}>
              <button type="button" onClick={() => setStep("athletes")}
                style={{ padding: ".6rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
                Back
              </button>
              <button type="button" onClick={() => setStep("account")}
                style={{ flex: 1, padding: ".6rem 1rem", background: primary, color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 700, cursor: "pointer" }}>
                Yes, that&apos;s right
              </button>
            </div>
          </div>
        )}

        {/* ── Step: create / sign in to account ── */}
        {step === "account" && (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
            <label style={LABEL_STYLE}>
              Your Name
              <input type="text" required autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={INPUT_STYLE} />
            </label>

            <label style={LABEL_STYLE}>
              Email
              <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={INPUT_STYLE} />
            </label>

            <label style={LABEL_STYLE}>
              Password
              <input type="password" required autoComplete="current-password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" style={INPUT_STYLE} />
              <span style={{ fontSize: ".7rem", color: "#9ca3af", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                Already have an ELF account? Enter your existing password — we&apos;ll add this team to it instead of making a new one.
              </span>
            </label>

            {needsPasswordHint === "existing" && (
              <p style={{ margin: 0, padding: ".5rem .7rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, color: "#1d4ed8", fontSize: ".82rem" }}>
                We found your existing ELF account. Enter your password above to continue.
              </p>
            )}
            {needsPasswordHint === "new" && (
              <p style={{ margin: 0, padding: ".5rem .7rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, color: "#1d4ed8", fontSize: ".82rem" }}>
                Choose a password (at least 8 characters) to create your account.
              </p>
            )}

            {error && (
              <p style={{ margin: 0, padding: ".5rem .7rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
                {error}
                {error === "Incorrect password." && (
                  <> — <a href="/request-reset" style={{ color: "#dc2626", fontWeight: 700 }}>Forgot password?</a></>
                )}
              </p>
            )}

            <div style={{ display: "flex", gap: ".5rem" }}>
              <button type="button" onClick={() => setStep("confirm")}
                style={{ padding: ".65rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 1, padding: ".65rem", background: loading ? "#9ca3af" : primary, color: "#fff",
                  border: "none", borderRadius: 9, fontSize: ".9rem", fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer", letterSpacing: ".01em",
                }}
              >
                {loading ? "Joining…" : "Join Team"}
              </button>
            </div>
          </form>
        )}

        <p style={{ margin: "1.5rem 0 0", textAlign: "center", fontSize: ".78rem", color: "#9ca3af" }}>
          Already a member?{" "}
          <a href={`/login`} style={{ color: "#0b1e3d", fontWeight: 600 }}>
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}
