"use client";

import { useState } from "react";
import type { TeamAthleteRow } from "@/lib/teamData";
import type { CampaignSettings } from "@/lib/supabase";
import Modal from "../../_components/Modal";

// ── Helpers ────────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

function avatarColor(name: string): string {
  const palette = ["#0b2044", "#92400e", "#1e3a8a", "#5b21b6", "#065f46", "#9f1239", "#1e4d7b", "#78350f"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[hash % palette.length];
}

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, color = "#0b1e3d" }: { pct: number; color?: string }) {
  return (
    <div style={{ background: "#e5e7eb", borderRadius: 100, height: 8, overflow: "hidden" }}>
      <div style={{
        background: color,
        borderRadius: 100,
        height: "100%",
        width: `${Math.min(100, Math.max(0, pct))}%`,
        transition: "width .6s ease",
      }} />
    </div>
  );
}

// ── Amount presets ─────────────────────────────────────────────────────────────

const PRESETS = [25, 50, 100, 250];

const INP: React.CSSProperties = {
  padding: ".55rem .75rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: 9,
  fontSize: ".875rem",
  color: "#111827",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const LBL: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: ".3rem",
  fontSize: ".72rem",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function AthleteProfileView({
  slug,
  athlete,
  athleteId,
  settings,
  athleteRaisedCents,
  teamRaisedCents,
  goalCents,
  rank,
  totalAthletes,
  donorCount,
  topSupporter,
}: {
  slug: string;
  athlete: TeamAthleteRow;
  athleteId: string;
  settings: CampaignSettings | null;
  athleteRaisedCents: number;
  teamRaisedCents: number;
  goalCents: number;
  rank: number;
  totalAthletes: number;
  donorCount: number;
  topSupporter: { name: string | null; amount_cents: number } | null;
}) {
  const [showDonate, setShowDonate] = useState(false);
  const [preset,    setPreset]    = useState<number | null>(50);
  const [custom,    setCustom]    = useState("");
  const [donorName, setDonorName] = useState("");
  const [message,   setMessage]   = useState("");
  const [donating,  setDonating]  = useState(false);
  const [donateErr, setDonateErr] = useState("");
  const [copied,    setCopied]    = useState(false);

  const bg         = avatarColor(athlete.name);
  const firstName  = athlete.name.split(" ")[0];
  const primary    = settings?.primary_color ?? "#0b1e3d";
  const secondary  = settings?.secondary_color ?? "#1d4ed8";
  const pct        = goalCents > 0 ? (athleteRaisedCents / goalCents) * 100 : 0;
  const teamGoal   = settings?.goal_cents ?? 0;
  const teamPct    = teamGoal > 0 ? (teamRaisedCents / teamGoal) * 100 : 0;
  const amtCents   = preset !== null ? preset * 100 : Math.round((parseFloat(custom) || 0) * 100);

  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "";
  // Points at the public campaign fundraiser (not the internal Team App
  // page) so donors who aren't logged into the team can open it — the
  // athlete= param preselects them in the public donation form.
  const shareUrl = `${siteOrigin}/campaign/${slug}?athlete=${athleteId}`;

  const handleDonate = async () => {
    if (amtCents < 100) { setDonateErr("Minimum donation is $1."); return; }
    setDonating(true);
    setDonateErr("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents:      amtCents,
          athleteName:      athlete.name,
          athleteId:        athleteId,
          donorName:        donorName.trim() || undefined,
          donationMessage:  message.trim()   || undefined,
          campaignSlug:     slug,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) { setDonateErr(data.error ?? "Something went wrong."); return; }
      window.location.href = data.url;
    } catch {
      setDonateErr("Connection error. Please try again.");
    } finally {
      setDonating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore on unsupported browsers */ }
  };

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `Support ${athlete.name}`,
          text: `Help ${firstName} reach their fundraising goal!`,
          url: shareUrl,
        });
      } catch { /* user cancelled or not supported */ }
    } else {
      handleCopy();
    }
  };

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>

      {/* Back link */}
      <a
        href={`/team/${slug}/team`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: ".3rem",
          fontSize: ".8rem",
          fontWeight: 600,
          color: "#6b7280",
          textDecoration: "none",
          marginBottom: ".875rem",
        }}
      >
        ← Team
      </a>

      {/* ── Hero card ── */}
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: "1.5rem 1rem 1.25rem",
        textAlign: "center",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        borderTop: `4px solid ${primary}`,
        marginBottom: ".65rem",
      }}>
        {/* Avatar */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: ".75rem" }}>
          {athlete.profile_photo ? (
            <img
              src={athlete.profile_photo}
              alt={athlete.name}
              style={{
                width: 80, height: 80, borderRadius: "50%", objectFit: "cover",
                boxShadow: "0 2px 12px rgba(0,0,0,.15)",
              }}
            />
          ) : (
            <div style={{
              width: 80, height: 80, borderRadius: "50%", background: bg,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: "1.5rem", color: "#fff",
              boxShadow: "0 2px 12px rgba(0,0,0,.18)",
            }}>
              {initials(athlete.name)}
            </div>
          )}
        </div>

        {/* Name */}
        <div style={{ fontWeight: 800, fontSize: "1.3rem", color: "#0b1e3d", lineHeight: 1.15, marginBottom: ".45rem" }}>
          {athlete.name}
        </div>

        {/* Badges */}
        <div style={{ display: "flex", justifyContent: "center", gap: ".35rem", flexWrap: "wrap" }}>
          {(athlete.class_year || athlete.event) && (
            <span style={{
              display: "inline-block", padding: ".18rem .55rem", borderRadius: 100,
              fontSize: ".65rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: ".04em", background: "#f0f4ff", color: "#1d4ed8",
            }}>
              {athlete.class_year || athlete.event}
            </span>
          )}
          {athlete.class_year && athlete.event && (
            <span style={{
              display: "inline-block", padding: ".18rem .55rem", borderRadius: 100,
              fontSize: ".65rem", fontWeight: 700,
              background: "#f3f4f6", color: "#6b7280",
            }}>
              {athlete.event}
            </span>
          )}
          {athlete.grad_year != null && (
            <span style={{
              display: "inline-block", padding: ".18rem .55rem", borderRadius: 100,
              fontSize: ".65rem", fontWeight: 700,
              background: "#f3f4f6", color: "#6b7280",
            }}>
              Class of &apos;{String(athlete.grad_year).slice(-2)}
            </span>
          )}
          {athlete.jersey_number != null && (
            <span style={{
              display: "inline-block", padding: ".18rem .55rem", borderRadius: 100,
              fontSize: ".65rem", fontWeight: 700,
              background: "#0b1e3d", color: "#fff",
            }}>
              #{athlete.jersey_number}
            </span>
          )}
        </div>
      </div>

      {/* ── Fundraising stats card ── */}
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: "1.25rem",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        marginBottom: ".65rem",
      }}>
        {/* Amount row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".55rem" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.65rem", color: "#0b1e3d", lineHeight: 1 }}>
              {fmt(athleteRaisedCents)}
            </div>
            <div style={{ fontSize: ".68rem", color: "#9ca3af", marginTop: ".15rem" }}>raised</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "#374151" }}>
              {fmt(goalCents)}
            </div>
            <div style={{ fontSize: ".68rem", color: "#9ca3af", marginTop: ".15rem" }}>goal</div>
          </div>
        </div>

        <ProgressBar pct={pct} color={primary} />

        <div style={{ fontSize: ".68rem", color: "#6b7280", marginTop: ".4rem", textAlign: "right" }}>
          {Math.round(pct)}% complete
        </div>

        {/* Rank + donors */}
        <div style={{
          display: "flex",
          gap: ".5rem",
          marginTop: ".875rem",
          paddingTop: ".875rem",
          borderTop: "1px solid #f3f4f6",
        }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#0b1e3d" }}>
              #{rank}
            </div>
            <div style={{ fontSize: ".63rem", color: "#9ca3af", marginTop: ".1rem" }}>
              of {totalAthletes} athletes
            </div>
          </div>
          <div style={{ width: 1, background: "#f3f4f6", flexShrink: 0 }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#0b1e3d" }}>
              {donorCount}
            </div>
            <div style={{ fontSize: ".63rem", color: "#9ca3af", marginTop: ".1rem" }}>
              {donorCount === 1 ? "donor" : "donors"}
            </div>
          </div>
        </div>

        {/* Top supporter */}
        {topSupporter && donorCount > 0 && (
          <div style={{
            marginTop: ".75rem",
            paddingTop: ".75rem",
            borderTop: "1px solid #f3f4f6",
            display: "flex",
            alignItems: "center",
            gap: ".5rem",
          }}>
            <span style={{ fontSize: ".82rem" }}>⭐</span>
            <div style={{ fontSize: ".72rem", color: "#6b7280" }}>
              <span style={{ fontWeight: 700, color: "#0b1e3d" }}>
                {topSupporter.name ?? "Anonymous"}
              </span>
              {" · "}
              <span style={{ fontWeight: 700, color: "#059669" }}>
                {(topSupporter.amount_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
              </span>
              <span style={{ color: "#9ca3af" }}> top supporter</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Donate button ── */}
      <button
        onClick={() => { setShowDonate(true); setDonateErr(""); }}
        style={{
          width: "100%",
          padding: ".9rem",
          background: primary,
          color: "#fff",
          border: "none",
          borderRadius: 14,
          fontSize: "1rem",
          fontWeight: 700,
          cursor: "pointer",
          marginBottom: ".65rem",
          letterSpacing: ".02em",
        }}
      >
        Donate to {firstName}
      </button>

      {/* ── Share card ── */}
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: "1rem 1.25rem",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        marginBottom: ".65rem",
      }}>
        <div style={{ fontWeight: 700, fontSize: ".82rem", color: "#0b1e3d", marginBottom: ".3rem" }}>
          Share this page
        </div>
        <p style={{ margin: "0 0 .75rem", fontSize: ".78rem", color: "#6b7280", lineHeight: 1.55 }}>
          Send this link to family and friends to support {firstName}.
        </p>
        <div style={{ display: "flex", gap: ".5rem" }}>
          <button
            onClick={handleCopy}
            style={{
              flex: 1,
              padding: ".6rem",
              background: "#f3f4f6",
              color: "#374151",
              border: "none",
              borderRadius: 10,
              fontSize: ".82rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {copied ? "✓ Copied!" : "Copy Link"}
          </button>
          <button
            onClick={handleShare}
            style={{
              flex: 1,
              padding: ".6rem",
              background: primary,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: ".82rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Share ↗
          </button>
        </div>
      </div>

      {/* ── Team total card (shown when goal exists) ── */}
      {teamGoal > 0 && (
        <div style={{
          background: "#fff",
          borderRadius: 16,
          padding: "1rem 1.25rem",
          boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontWeight: 700, fontSize: ".82rem", color: "#0b1e3d", marginBottom: ".55rem" }}>
            {settings?.school_name ? `${settings.school_name} · Team Total` : "Team Total"}
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            marginBottom: ".5rem",
          }}>
            <span style={{ fontWeight: 700, fontSize: ".95rem", color: "#374151" }}>
              {fmt(teamRaisedCents)}
            </span>
            <span style={{ fontSize: ".72rem", color: "#9ca3af" }}>
              goal {fmt(teamGoal)}
            </span>
          </div>
          <ProgressBar pct={teamPct} color={secondary} />
        </div>
      )}

      {/* ── Donate modal ── */}
      {showDonate && (
        <Modal title={`Support ${firstName}`} onClose={() => setShowDonate(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            {/* Amount presets */}
            <div>
              <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".45rem" }}>
                Choose amount
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: ".4rem", marginBottom: ".4rem" }}>
                {PRESETS.map(p => (
                  <button
                    key={p}
                    onClick={() => { setPreset(p); setCustom(""); }}
                    style={{
                      padding: ".55rem .25rem",
                      background: preset === p ? primary : "#f3f4f6",
                      color: preset === p ? "#fff" : "#374151",
                      border: "none",
                      borderRadius: 9,
                      fontWeight: 700,
                      fontSize: ".88rem",
                      cursor: "pointer",
                    }}
                  >
                    ${p}
                  </button>
                ))}
              </div>
              <input
                type="number"
                placeholder="Other amount ($)"
                value={custom}
                min={1}
                onChange={e => { setCustom(e.target.value); setPreset(null); }}
                onFocus={() => setPreset(null)}
                style={{
                  ...INP,
                  border: `1.5px solid ${preset === null && custom ? primary : "#e5e7eb"}`,
                }}
              />
            </div>

            {/* Donor name */}
            <label style={LBL}>
              Your name (optional)
              <input
                type="text"
                placeholder="Anonymous"
                value={donorName}
                onChange={e => setDonorName(e.target.value)}
                style={{ ...INP, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
              />
            </label>

            {/* Message */}
            <label style={LBL}>
              Message (optional)
              <textarea
                placeholder="Go team!"
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={2}
                style={{
                  ...INP,
                  resize: "none",
                  fontWeight: 400,
                  letterSpacing: 0,
                  textTransform: "none",
                }}
              />
            </label>

            {donateErr && (
              <p style={{
                margin: 0,
                padding: ".45rem .65rem",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                color: "#dc2626",
                fontSize: ".82rem",
              }}>
                {donateErr}
              </p>
            )}

            <button
              onClick={handleDonate}
              disabled={donating || amtCents < 100}
              style={{
                padding: ".8rem",
                background: amtCents >= 100 ? primary : "#e5e7eb",
                color: amtCents >= 100 ? "#fff" : "#9ca3af",
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: "1rem",
                cursor: amtCents >= 100 && !donating ? "pointer" : "not-allowed",
                transition: "background .15s ease",
              }}
            >
              {donating
                ? "Redirecting to Stripe…"
                : amtCents >= 100
                ? `Donate ${fmt(amtCents)} →`
                : "Choose an amount"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
