"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { TeamAthleteRow } from "@/lib/teamData";
import type { CampaignSettings } from "@/lib/supabase";
import Modal from "../_components/Modal";

// ── Exported types (consumed by page.tsx) ─────────────────────────────────────

export type RecentDonation = {
  donor_name:       string | null;
  amount_cents:     number;
  donation_message: string | null;
  created_at:       string;
};

export type LeaderboardEntry = {
  id:            string;
  name:          string;
  profile_photo: string | null;
  event:         string | null;
  class_year:    string | null;
  raisedCents:   number;
  goalCents:     number | null;
  donorCount:    number;
  rank:          number;
};

export type FeedDonation = {
  donor_name:       string | null;
  amount_cents:     number;
  athlete_label:    string | null;
  donation_message: string | null;
  created_at:       string;
};

// ── Prop types ────────────────────────────────────────────────────────────────

type AthleteMode = {
  mode:                "athlete";
  slug:                string;
  athlete:             TeamAthleteRow;
  settings:            CampaignSettings | null;
  athleteRaisedCents:  number;
  goalCents:           number;
  rank:                number;
  totalAthletes:       number;
  donorCount:          number;
  recentDonations:     RecentDonation[];
  leaderboard:         LeaderboardEntry[];
  teamFeed:            FeedDonation[];
};

type ClaimMode = {
  mode:     "claim";
  slug:     string;
  roster:   TeamAthleteRow[];
  settings: CampaignSettings | null;
};

type Props = AthleteMode | ClaimMode;

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)    return "just now";
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ background: "#e5e7eb", borderRadius: 100, height: 10, overflow: "hidden" }}>
      <div style={{
        background: color, borderRadius: 100, height: "100%",
        width: `${Math.min(100, Math.max(0, pct))}%`,
        transition: "width .6s ease",
      }} />
    </div>
  );
}

// ── Contacts progress card (athlete/parent only) ──────────────────────────────

function ContactsCard({ slug, primary }: { slug: string; primary: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [goal,  setGoal]  = useState<number>(10);

  useEffect(() => {
    fetch(`/api/team/${slug}/contacts?summary=1`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setCount(d.count); setGoal(d.goal); } })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = goal > 0 && count !== null ? Math.min(100, Math.round((count / goal) * 100)) : 0;

  return (
    <div style={{
      background: "#fff", borderRadius: 16, overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      marginBottom: ".65rem",
    }}>
      <div style={{ padding: ".875rem 1.25rem .6rem", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: ".7rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em" }}>My Contacts</div>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0b1e3d", marginTop: ".1rem" }}>Fundraising Contacts</div>
        </div>
        <a
          href={`/team/${slug}/contacts`}
          style={{ padding: ".4rem .9rem", background: primary, color: "#fff", borderRadius: 20, fontSize: ".75rem", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          Add Contacts →
        </a>
      </div>
      <div style={{ padding: ".75rem 1.25rem" }}>
        {count === null ? (
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".45rem" }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: "1.4rem", color: "#0b1e3d", lineHeight: 1 }}>{count}</span>
                <span style={{ fontSize: ".78rem", color: "#6b7280", marginLeft: ".3rem" }}>of {goal} contacts</span>
              </div>
              <span style={{ fontSize: ".75rem", fontWeight: 700, color: pct >= 100 ? "#059669" : "#6b7280" }}>{pct}%</span>
            </div>
            <div style={{ background: "#e5e7eb", borderRadius: 100, height: 7, overflow: "hidden" }}>
              <div style={{ background: pct >= 100 ? "#059669" : primary, borderRadius: 100, height: "100%", width: `${pct}%`, transition: "width .5s ease" }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Leaderboard section ───────────────────────────────────────────────────────

function LeaderboardSection({
  leaderboard,
  currentAthleteId,
  primary,
}: {
  leaderboard:       LeaderboardEntry[];
  currentAthleteId:  string;
  primary:           string;
}) {
  if (leaderboard.length === 0) return null;

  return (
    <div style={{
      background: "#fff",
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      marginBottom: ".65rem",
    }}>
      <div style={{
        padding: ".875rem 1.25rem .6rem",
        borderBottom: "1px solid #f3f4f6",
        display: "flex",
        alignItems: "center",
        gap: ".5rem",
      }}>
        <div style={{ fontSize: ".7rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em" }}>
          Team Leaderboard
        </div>
        <span style={{ background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".1rem .4rem", lineHeight: 1.4 }}>
          {leaderboard.length}
        </span>
      </div>

      <div style={{ padding: ".2rem 0" }}>
        {leaderboard.map((entry, i) => {
          const isCurrent = entry.id === currentAthleteId;
          const pct = entry.goalCents && entry.goalCents > 0
            ? Math.min(100, Math.round((entry.raisedCents / entry.goalCents) * 100))
            : null;
          const bg = avatarColor(entry.name);

          return (
            <div
              key={entry.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: ".65rem",
                padding: ".6rem 1.25rem",
                background: isCurrent ? `${primary}08` : "transparent",
                borderLeft: isCurrent ? `3px solid ${primary}` : "3px solid transparent",
                borderBottom: i < leaderboard.length - 1 ? "1px solid #f9fafb" : "none",
              }}
            >
              {/* Rank */}
              <div style={{
                width: 20, fontWeight: 800, fontSize: ".7rem",
                color: entry.rank <= 3 ? "#0b1e3d" : "#c4c9d4",
                flexShrink: 0, paddingTop: ".25rem", textAlign: "center",
              }}>
                #{entry.rank}
              </div>

              {/* Avatar */}
              <div style={{ flexShrink: 0 }}>
                {entry.profile_photo ? (
                  <img
                    src={entry.profile_photo}
                    alt={entry.name}
                    style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", background: bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: ".65rem", color: "#fff",
                  }}>
                    {initials(entry.name)}
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".15rem" }}>
                  <span style={{
                    fontWeight: isCurrent ? 800 : 700,
                    fontSize: ".84rem",
                    color: isCurrent ? primary : "#0b1e3d",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    maxWidth: "58%",
                  }}>
                    {entry.name}{isCurrent ? " (you)" : ""}
                  </span>
                  <span style={{ fontWeight: 800, fontSize: ".92rem", color: "#0b1e3d", flexShrink: 0 }}>
                    {fmt(entry.raisedCents)}
                  </span>
                </div>

                <div style={{ fontSize: ".68rem", color: "#9ca3af", marginBottom: pct !== null ? ".3rem" : 0 }}>
                  {entry.class_year ?? entry.event}
                  {entry.donorCount > 0
                    ? ` · ${entry.donorCount} donor${entry.donorCount !== 1 ? "s" : ""}`
                    : ""}
                </div>

                {pct !== null && (
                  <div>
                    <div style={{ height: 5, background: "#f3f4f6", borderRadius: 100, overflow: "hidden", marginBottom: ".2rem" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: isCurrent ? primary : "#d1d5db", borderRadius: 100 }} />
                    </div>
                    <div style={{ fontSize: ".63rem", fontWeight: 700, color: isCurrent ? primary : "#9ca3af" }}>
                      {pct}% of goal
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Team donation feed ─────────────────────────────────────────────────────────

function TeamDonationFeed({
  teamFeed,
  secondary,
}: {
  teamFeed:  FeedDonation[];
  secondary: string;
}) {
  if (teamFeed.length === 0) return null;

  return (
    <div style={{
      background: "#fff",
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      marginBottom: ".65rem",
    }}>
      <div style={{ padding: ".875rem 1.25rem .6rem", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ fontSize: ".7rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em" }}>
          Team Donations
        </div>
      </div>

      <div style={{ padding: ".2rem 0" }}>
        {teamFeed.map((d, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: ".65rem",
              padding: ".65rem 1.25rem",
              borderBottom: i < teamFeed.length - 1 ? "1px solid #f9fafb" : "none",
              alignItems: "flex-start",
            }}
          >
            {/* Donor bubble */}
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: secondary,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: ".62rem", color: "#fff", flexShrink: 0,
            }}>
              {d.donor_name ? initials(d.donor_name) : "?"}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Amount + time */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".18rem" }}>
                <span style={{ fontWeight: 800, fontSize: "1.05rem", color: "#059669" }}>
                  {fmt(d.amount_cents)}
                </span>
                <span style={{ fontSize: ".62rem", color: "#9ca3af", flexShrink: 0 }}>
                  {timeAgo(d.created_at)}
                </span>
              </div>

              {/* Donor → athlete */}
              <div style={{ fontSize: ".75rem", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.donor_name ?? "Anonymous"}
                {d.athlete_label && (
                  <span style={{ color: "#9ca3af" }}> → {d.athlete_label}</span>
                )}
              </div>

              {/* Message */}
              {d.donation_message && (
                <div style={{ fontSize: ".7rem", color: "#9ca3af", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: ".12rem" }}>
                  &ldquo;{d.donation_message}&rdquo;
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Claim flow ─────────────────────────────────────────────────────────────────

function ClaimView({ slug, roster, settings }: ClaimMode) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const primary = settings?.primary_color ?? "#0b1e3d";

  const handleSave = async () => {
    if (!selected) { setError("Please select your name from the roster."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/team/${slug}/members/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athlete_id: selected }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to link profile."); return; }
      router.refresh();
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <div style={{ marginBottom: ".65rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Fundraiser
        </span>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
          My Dashboard
        </h2>
      </div>

      <div style={{
        background: "#fff", borderRadius: 16, padding: "1.5rem 1.25rem",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        borderTop: `4px solid ${primary}`,
      }}>
        <div style={{ fontSize: "1.5rem", marginBottom: ".6rem", textAlign: "center" }}>🏃</div>
        <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0b1e3d", textAlign: "center", marginBottom: ".4rem" }}>
          Link your fundraising profile
        </div>
        <p style={{ margin: "0 0 1.25rem", fontSize: ".82rem", color: "#6b7280", lineHeight: 1.6, textAlign: "center" }}>
          Select your name from the roster to track your personal fundraising progress and share your page.
        </p>

        {roster.length === 0 ? (
          <p style={{ textAlign: "center", fontSize: ".82rem", color: "#9ca3af" }}>
            The roster is empty. Contact your coach to be added.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
            <select
              value={selected}
              onChange={e => { setSelected(e.target.value); setError(""); }}
              style={{
                width: "100%", padding: ".6rem .75rem",
                border: `1.5px solid ${selected ? primary : "#e5e7eb"}`,
                borderRadius: 10, fontSize: ".875rem",
                color: selected ? "#111827" : "#9ca3af",
                background: "#fff", cursor: "pointer", boxSizing: "border-box",
              }}
            >
              <option value="">Select your name…</option>
              {roster.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}{(a.class_year || a.event) ? ` — ${a.class_year || a.event}` : ""}
                </option>
              ))}
            </select>

            {error && (
              <p style={{ margin: 0, padding: ".4rem .6rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
                {error}
              </p>
            )}

            <button
              onClick={handleSave}
              disabled={saving || !selected}
              style={{
                padding: ".75rem",
                background: selected ? primary : "#e5e7eb",
                color: selected ? "#fff" : "#9ca3af",
                border: "none", borderRadius: 12, fontWeight: 700, fontSize: ".95rem",
                cursor: selected && !saving ? "pointer" : "not-allowed",
              }}
            >
              {saving ? "Linking…" : "Link My Profile"}
            </button>

            <p style={{ margin: 0, textAlign: "center", fontSize: ".72rem", color: "#9ca3af" }}>
              Not on the roster? Contact your coach to be added.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Athlete dashboard ──────────────────────────────────────────────────────────

function AthleteView({
  slug, athlete, settings,
  athleteRaisedCents, goalCents, rank, totalAthletes, donorCount,
  recentDonations, leaderboard, teamFeed,
}: AthleteMode) {
  const [copied,    setCopied]    = useState(false);
  const [showQr,    setShowQr]    = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const primary   = settings?.primary_color   ?? "#0b1e3d";
  const secondary = settings?.secondary_color ?? "#1d4ed8";
  const bg        = avatarColor(athlete.name);
  const firstName = athlete.name.split(" ")[0];
  const pct       = goalCents > 0 ? (athleteRaisedCents / goalCents) * 100 : 0;
  // Points at the public campaign fundraiser (not the internal Team App
  // page) so donors who aren't logged into the team can open it — the
  // athlete= param preselects them in the public donation form. Mirrors
  // the same fix in AthleteProfileView.tsx's shareUrl.
  const profilePath = `/campaign/${slug}?athlete=${athlete.id}`;

  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const profileUrl = `${siteOrigin}${profilePath}`;

  useEffect(() => {
    import("qrcode").then(QRCode => {
      QRCode.default.toDataURL(profileUrl, { width: 240, margin: 2, color: { dark: "#0b1e3d" } })
        .then(url => setQrDataUrl(url))
        .catch(() => { /* silently ignore */ });
    });
  }, [profileUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: `Support ${athlete.name}`, text: `Help ${firstName} reach their fundraising goal!`, url: profileUrl });
      } catch { /* cancelled */ }
    } else {
      handleCopy();
    }
  };

  const teamLabel = [settings?.school_name, settings?.mascot, settings?.sport_name].filter(Boolean).join(" ");

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>

      {/* Section header */}
      <div style={{ marginBottom: ".65rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Fundraiser
        </span>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
          My Dashboard
        </h2>
      </div>

      {/* ── Hero card ── */}
      <div style={{
        background: "#fff", borderRadius: 16, padding: "1.25rem 1rem 1rem",
        textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        borderTop: `4px solid ${primary}`, marginBottom: ".65rem",
      }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: ".65rem" }}>
          {athlete.profile_photo ? (
            <img src={athlete.profile_photo} alt={athlete.name} style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", boxShadow: "0 2px 10px rgba(0,0,0,.13)" }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1.35rem", color: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,.16)" }}>
              {initials(athlete.name)}
            </div>
          )}
        </div>
        <div style={{ fontWeight: 800, fontSize: "1.2rem", color: "#0b1e3d", lineHeight: 1.15, marginBottom: ".25rem" }}>
          {athlete.name}
        </div>
        {teamLabel && (
          <div style={{ fontSize: ".75rem", color: "#6b7280", marginBottom: ".45rem" }}>{teamLabel}</div>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: ".35rem", flexWrap: "wrap" }}>
          {(athlete.class_year || athlete.event) && (
            <span style={{ display: "inline-block", padding: ".15rem .5rem", borderRadius: 100, fontSize: ".62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", background: "#f0f4ff", color: "#1d4ed8" }}>
              {athlete.class_year || athlete.event}
            </span>
          )}
          {athlete.class_year && athlete.event && (
            <span style={{ display: "inline-block", padding: ".15rem .5rem", borderRadius: 100, fontSize: ".62rem", fontWeight: 700, background: "#f3f4f6", color: "#6b7280" }}>
              {athlete.event}
            </span>
          )}
          {athlete.grad_year != null && (
            <span style={{ display: "inline-block", padding: ".15rem .5rem", borderRadius: 100, fontSize: ".62rem", fontWeight: 700, background: "#f3f4f6", color: "#6b7280" }}>
              Class of &apos;{String(athlete.grad_year).slice(-2)}
            </span>
          )}
        </div>
      </div>

      {/* ── Stats card ── */}
      <div style={{
        background: "#fff", borderRadius: 16, padding: "1.25rem",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        marginBottom: ".65rem",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".55rem" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.65rem", color: "#0b1e3d", lineHeight: 1 }}>
              {fmt(athleteRaisedCents)}
            </div>
            <div style={{ fontSize: ".68rem", color: "#9ca3af", marginTop: ".15rem" }}>raised</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "#374151" }}>{fmt(goalCents)}</div>
            <div style={{ fontSize: ".68rem", color: "#9ca3af", marginTop: ".15rem" }}>goal</div>
          </div>
        </div>

        <ProgressBar pct={pct} color={primary} />
        <div style={{ fontSize: ".68rem", color: "#6b7280", marginTop: ".4rem", textAlign: "right" }}>
          {Math.round(pct)}% complete
        </div>

        <div style={{ display: "flex", gap: ".5rem", marginTop: ".875rem", paddingTop: ".875rem", borderTop: "1px solid #f3f4f6" }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: "1.15rem", color: primary }}>#{rank}</div>
            <div style={{ fontSize: ".63rem", color: "#9ca3af", marginTop: ".1rem" }}>of {totalAthletes} athletes</div>
          </div>
          <div style={{ width: 1, background: "#f3f4f6", flexShrink: 0 }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#0b1e3d" }}>{donorCount}</div>
            <div style={{ fontSize: ".63rem", color: "#9ca3af", marginTop: ".1rem" }}>{donorCount === 1 ? "donor" : "donors"}</div>
          </div>
        </div>
      </div>

      {/* ── Fundraising contacts ── */}
      <ContactsCard slug={slug} primary={primary} />

      {/* ── Team leaderboard ── */}
      <LeaderboardSection
        leaderboard={leaderboard}
        currentAthleteId={athlete.id}
        primary={primary}
      />

      {/* ── Share actions ── */}
      <div style={{
        background: "#fff", borderRadius: 16, padding: "1rem 1.25rem",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        marginBottom: ".65rem",
      }}>
        <div style={{ fontSize: ".7rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".65rem" }}>
          Share your fundraising page
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: ".5rem" }}>
          <button onClick={handleCopy} style={{ padding: ".65rem .25rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: ".78rem", fontWeight: 600, cursor: "pointer" }}>
            {copied ? "✓ Copied" : "Copy Link"}
          </button>
          <button onClick={handleShare} style={{ padding: ".65rem .25rem", background: primary, color: "#fff", border: "none", borderRadius: 10, fontSize: ".78rem", fontWeight: 600, cursor: "pointer" }}>
            Share ↗
          </button>
          <button onClick={() => setShowQr(true)} style={{ padding: ".65rem .25rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: ".78rem", fontWeight: 600, cursor: "pointer" }}>
            QR Code
          </button>
        </div>
      </div>

      {/* ── My recent donations ── */}
      {recentDonations.length > 0 && (
        <div style={{
          background: "#fff", borderRadius: 16, padding: "1rem 1.25rem",
          boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
          marginBottom: ".65rem",
        }}>
          <div style={{ fontSize: ".7rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".65rem" }}>
            My Recent Donations
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: ".55rem" }}>
            {recentDonations.map((d, i) => (
              <div
                key={i}
                style={{
                  display: "flex", alignItems: "center", gap: ".75rem",
                  paddingBottom: i < recentDonations.length - 1 ? ".55rem" : 0,
                  borderBottom: i < recentDonations.length - 1 ? "1px solid #f3f4f6" : "none",
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: secondary, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: ".65rem", color: "#fff", flexShrink: 0 }}>
                  {d.donor_name ? d.donor_name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("") : "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: ".83rem", color: "#0b1e3d" }}>
                    {d.donor_name ?? "Anonymous"}
                  </div>
                  {d.donation_message && (
                    <div style={{ fontSize: ".72rem", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      &ldquo;{d.donation_message}&rdquo;
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: ".95rem", color: "#059669" }}>
                    {fmt(d.amount_cents)}
                  </div>
                  <div style={{ fontSize: ".65rem", color: "#9ca3af" }}>
                    {timeAgo(d.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Team donation feed ── */}
      <TeamDonationFeed teamFeed={teamFeed} secondary={secondary} />

      {/* ── QR Code modal ── */}
      {showQr && (
        <Modal title="Your Fundraising QR Code" onClose={() => setShowQr(false)}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", paddingBottom: ".5rem" }}>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={`QR code for ${athlete.name}'s fundraising page`} style={{ width: 220, height: 220, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,.10)" }} />
            ) : (
              <div style={{ width: 220, height: 220, borderRadius: 12, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".82rem", color: "#9ca3af" }}>
                Generating…
              </div>
            )}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 700, fontSize: ".88rem", color: "#0b1e3d", marginBottom: ".2rem" }}>
                Scan to donate to {firstName}
              </div>
              <div style={{ fontSize: ".7rem", color: "#9ca3af", fontFamily: "monospace", wordBreak: "break-all" }}>
                {profilePath}
              </div>
            </div>
            <button onClick={handleCopy} style={{ width: "100%", padding: ".65rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
              {copied ? "✓ Link Copied!" : "Copy Link"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Root export ────────────────────────────────────────────────────────────────

export default function FundraiserView(props: Props) {
  if (props.mode === "claim") return <ClaimView {...props} />;
  return <AthleteView {...props} />;
}
