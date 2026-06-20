"use client";

import { useState } from "react";
import type { CampaignSettings } from "@/lib/supabase";
import type { OutreachCurrentRow } from "@/lib/teamData";

// ── Exported types (consumed by page.tsx) ─────────────────────────────────────

export type TeamStats = {
  raisedCents:   number;
  teamGoalCents: number;
  donorCount:    number;
  avgDonation:   number;
  pct:           number;
  daysRemaining: number | null;
};

export type PaceData = {
  daysRemaining:   number;
  neededPerDay:    number;
  currentPerDay:   number;
  projectedFinish: number;
  onTrack:         boolean;
} | null;

export type AthleteProgress = {
  id:             string;
  name:           string;
  event:          string;
  profile_photo:  string | null;
  raisedCents:    number;
  goalCents:      number | null;
  pct:            number | null;
  donorCount:     number;
  lastDonationAt: string | null;
  rank:           number;
  contact_phone:  string | null;
  contact_email:  string | null;
};

export type TopDonor = {
  name:          string;
  totalCents:    number;
  donationCount: number;
  athletes:      string[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtDay(cents: number) {
  return `${fmt(cents)}/day`;
}

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)    return "just now";
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

function avatarColor(name: string): string {
  const palette = ["#0b2044", "#92400e", "#1e3a8a", "#5b21b6", "#065f46", "#9f1239", "#1e4d7b", "#78350f"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[hash % palette.length];
}

// ── Team overview ─────────────────────────────────────────────────────────────

function TeamOverviewCard({
  teamStats,
  settings,
}: {
  teamStats: TeamStats;
  settings:  CampaignSettings;
}) {
  const { raisedCents, teamGoalCents, donorCount, avgDonation, pct, daysRemaining } = teamStats;
  const primary = settings.primary_color;

  return (
    <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)", marginBottom: ".75rem" }}>
      {/* Color band */}
      <div style={{ background: primary, padding: "1rem 1.25rem .875rem", color: "#fff" }}>
        {settings.season && (
          <div style={{ fontSize: ".62rem", opacity: .75, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".2rem" }}>
            {settings.season}
          </div>
        )}
        <div style={{ fontWeight: 800, fontSize: "1rem" }}>{settings.school_name}</div>
        {[settings.mascot, settings.sport_name].filter(Boolean).length > 0 && (
          <div style={{ fontSize: ".78rem", opacity: .85, marginTop: ".15rem" }}>
            {[settings.mascot, settings.sport_name].filter(Boolean).join(" · ")}
          </div>
        )}
        <div style={{ background: settings.secondary_color || "rgba(255,255,255,.25)", height: 2, borderRadius: 2, marginTop: ".75rem", marginLeft: "-1.25rem", marginRight: "-1.25rem", marginBottom: "-.875rem" }} />
      </div>

      <div style={{ padding: "1rem 1.25rem 1.25rem" }}>
        {/* Raised */}
        <div style={{ marginBottom: ".75rem" }}>
          <span style={{ fontSize: "1.85rem", fontWeight: 800, color: "#111827" }}>{fmt(raisedCents)}</span>
          {teamGoalCents > 0 && (
            <span style={{ fontSize: ".875rem", color: "#6b7280", marginLeft: ".35rem" }}>of {fmt(teamGoalCents)} goal</span>
          )}
        </div>

        {/* Progress bar */}
        {teamGoalCents > 0 && (
          <div style={{ marginBottom: ".875rem" }}>
            <div style={{ height: 10, background: "#f3f4f6", borderRadius: 100, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${primary}, ${primary}cc)`, borderRadius: 100, transition: "width .4s ease" }} />
            </div>
            <div style={{ marginTop: ".3rem", fontSize: ".72rem", fontWeight: 700, color: primary }}>{pct}% funded</div>
          </div>
        )}

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".5rem" }}>
          {[
            { label: "Total Donors", value: String(donorCount) },
            { label: "Avg Donation", value: fmt(avgDonation) },
            ...(daysRemaining !== null ? [{
              label: "Days Remaining",
              value: String(daysRemaining),
              urgent: daysRemaining <= 7,
            }] : []),
            ...(teamGoalCents > 0 ? [{
              label: "Still Needed",
              value: fmt(Math.max(0, teamGoalCents - raisedCents)),
            }] : []),
          ].map((stat, i) => (
            <div
              key={i}
              style={{
                background: "#f8f9fb", borderRadius: 10, padding: ".6rem .75rem",
              }}
            >
              <div style={{
                fontSize: "1.1rem", fontWeight: 800,
                color: ("urgent" in stat && stat.urgent) ? "#dc2626" : "#111827",
              }}>
                {stat.value}
              </div>
              <div style={{ fontSize: ".65rem", color: "#9ca3af", marginTop: ".1rem" }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Needs attention ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  contacted:       { label: "Contacted",   bg: "#dbeafe", color: "#1e40af" },
  needs_follow_up: { label: "Follow Up",   bg: "#fef3c7", color: "#92400e" },
  resolved:        { label: "Resolved",    bg: "#d1fae5", color: "#065f46" },
};

function NeedsAttentionCard({
  needsAttention,
  slug,
  initialOutreachMap,
}: {
  needsAttention:     AthleteProgress[];
  slug:               string;
  initialOutreachMap: Record<string, OutreachCurrentRow>;
}) {
  const [outreachMap,   setOutreachMap]   = useState<Record<string, OutreachCurrentRow>>(initialOutreachMap);
  const [resolvedIds,   setResolvedIds]   = useState<Set<string>>(new Set());
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [noteTexts,     setNoteTexts]     = useState<Record<string, string>>({});
  const [saving,        setSaving]        = useState<Record<string, boolean>>({});

  const visible = needsAttention.filter(a => !resolvedIds.has(a.id));

  const postAction = async (athleteId: string, status: string, note?: string) => {
    if (saving[athleteId]) return;
    const prev = outreachMap[athleteId] ?? null;

    // Optimistic update
    setSaving(s => ({ ...s, [athleteId]: true }));
    const optimistic: OutreachCurrentRow = {
      id: "opt", athlete_id: athleteId, campaign_slug: slug,
      status: status as OutreachCurrentRow["status"],
      note: note !== undefined ? note : (prev?.note ?? null),
      contacted_by: prev?.contacted_by ?? null,
      coach_id: prev?.coach_id ?? null,
      created_at: new Date().toISOString(),
    };
    setOutreachMap(m => ({ ...m, [athleteId]: optimistic }));
    if (status === "resolved") setResolvedIds(s => new Set([...s, athleteId]));

    try {
      const res = await fetch(`/api/team/${slug}/outreach/${athleteId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(note !== undefined ? { note } : {}) }),
      });
      if (res.ok) {
        const row: OutreachCurrentRow = await res.json();
        setOutreachMap(m => ({ ...m, [athleteId]: row }));
      } else {
        // Rollback
        setOutreachMap(m => prev ? { ...m, [athleteId]: prev } : m);
        if (status === "resolved") setResolvedIds(s => { const n = new Set(s); n.delete(athleteId); return n; });
      }
    } catch {
      setOutreachMap(m => prev ? { ...m, [athleteId]: prev } : m);
      if (status === "resolved") setResolvedIds(s => { const n = new Set(s); n.delete(athleteId); return n; });
    } finally {
      setSaving(s => ({ ...s, [athleteId]: false }));
    }
  };

  const saveNote = async (athleteId: string) => {
    const text = noteTexts[athleteId]?.trim();
    if (!text) return;
    const currentStatus = outreachMap[athleteId]?.status ?? "contacted";
    await postAction(athleteId, currentStatus, text);
    setExpandedNotes(s => { const n = new Set(s); n.delete(athleteId); return n; });
    setNoteTexts(t => ({ ...t, [athleteId]: "" }));
  };

  if (visible.length === 0 && needsAttention.length > 0) {
    return (
      <div style={{
        background: "#f0fdf4", borderRadius: 14, padding: "1.25rem",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        borderLeft: "3px solid #16a34a", textAlign: "center", marginBottom: ".75rem",
      }}>
        <div style={{ fontSize: "1.4rem", marginBottom: ".3rem" }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: ".88rem", color: "#065f46" }}>All caught up!</div>
        <div style={{ fontSize: ".75rem", color: "#6b7280", marginTop: ".2rem" }}>All flagged athletes have been resolved.</div>
      </div>
    );
  }

  if (visible.length === 0) return null;

  return (
    <div style={{
      background: "#fff", borderRadius: 14, overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      borderLeft: "3px solid #d97706", marginBottom: ".75rem",
    }}>
      <div style={{
        padding: ".75rem 1.25rem .55rem", borderBottom: "1px solid #f3f4f6",
        display: "flex", alignItems: "center", gap: ".5rem",
      }}>
        <span style={{ fontSize: ".82rem" }}>⚠️</span>
        <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: ".07em" }}>
          Needs Attention
        </span>
        <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".1rem .4rem", lineHeight: 1.4 }}>
          {visible.length}
        </span>
      </div>

      <div style={{ padding: ".25rem 0" }}>
        {visible.map((a, i) => {
          const outreach    = outreachMap[a.id] ?? null;
          const status      = outreach?.status ?? null;
          const isSaving    = saving[a.id] ?? false;
          const isNoteOpen  = expandedNotes.has(a.id);
          const badge       = status ? STATUS_CONFIG[status] : null;
          const bg          = avatarColor(a.name);

          const flags: string[] = [];
          if (a.raisedCents === 0)                               flags.push("No donations");
          else if (a.donorCount <= 1)                            flags.push(`${a.donorCount} donor`);
          if (a.pct !== null && a.pct < 10 && a.raisedCents > 0) flags.push(`${a.pct}% of goal`);

          const btnBase: React.CSSProperties = {
            border: "none", borderRadius: 6, fontSize: ".63rem", fontWeight: 700,
            padding: ".2rem .55rem", cursor: isSaving ? "not-allowed" : "pointer",
            opacity: isSaving ? .55 : 1, transition: "opacity .1s",
          };

          return (
            <div key={a.id} style={{ borderBottom: i < visible.length - 1 ? "1px solid #f9fafb" : "none", padding: ".7rem 1.25rem" }}>

              {/* Profile row — tap → athlete profile */}
              <a href={`/team/${slug}/athlete/${a.id}`} style={{ display: "flex", alignItems: "center", gap: ".65rem", textDecoration: "none", marginBottom: ".55rem" }}>
                {a.profile_photo ? (
                  <img src={a.profile_photo} alt={a.name} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".62rem", color: "#fff", flexShrink: 0 }}>
                    {initials(a.name)}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: ".85rem", color: "#0b1e3d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                  <div style={{ fontSize: ".68rem", color: "#9ca3af" }}>{a.event}</div>
                </div>
                <div style={{ display: "flex", gap: ".3rem", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                  {flags.map(f => (
                    <span key={f} style={{ background: "#fef3c7", color: "#92400e", borderRadius: 6, fontSize: ".6rem", fontWeight: 700, padding: ".15rem .4rem", whiteSpace: "nowrap" }}>{f}</span>
                  ))}
                  <span style={{ fontSize: ".65rem", color: "#d1d5db" }}>›</span>
                </div>
              </a>

              {/* Status badge + action buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: ".35rem", alignItems: "center", marginBottom: ".4rem" }}>
                {badge ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: ".25rem", background: badge.bg, color: badge.color, borderRadius: 6, fontSize: ".65rem", fontWeight: 700, padding: ".2rem .55rem" }}>
                    ● {badge.label}
                    {outreach?.contacted_by && (
                      <span style={{ fontWeight: 400, opacity: .7 }}>· {outreach.contacted_by}</span>
                    )}
                  </span>
                ) : (
                  <span style={{ fontSize: ".65rem", color: "#b0b7c3", fontWeight: 600 }}>No contact yet</span>
                )}

                {status !== "contacted" && (
                  <button disabled={isSaving} onClick={() => postAction(a.id, "contacted")}
                    style={{ ...btnBase, background: "#dbeafe", color: "#1e40af" }}>
                    Contacted
                  </button>
                )}
                {status !== "needs_follow_up" && (
                  <button disabled={isSaving} onClick={() => postAction(a.id, "needs_follow_up")}
                    style={{ ...btnBase, background: "#fef3c7", color: "#92400e" }}>
                    Follow Up
                  </button>
                )}
                <button disabled={isSaving} onClick={() => postAction(a.id, "resolved")}
                  style={{ ...btnBase, background: "#d1fae5", color: "#065f46" }}>
                  Resolve ✓
                </button>
              </div>

              {/* Latest note preview */}
              {outreach?.note && !isNoteOpen && (
                <div style={{ fontSize: ".72rem", color: "#6b7280", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: ".35rem" }}>
                  &ldquo;{outreach.note}&rdquo;
                </div>
              )}

              {/* Contact links (phone / email) */}
              {(a.contact_phone || a.contact_email) && (
                <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", marginBottom: ".35rem" }}>
                  {a.contact_phone && (
                    <a href={`tel:${a.contact_phone}`} style={{ display: "inline-flex", alignItems: "center", gap: ".2rem", fontSize: ".65rem", fontWeight: 700, color: "#0b1e3d", background: "#f0f4ff", borderRadius: 6, padding: ".2rem .5rem", textDecoration: "none" }}>
                      📞 {a.contact_phone}
                    </a>
                  )}
                  {a.contact_email && (
                    <a href={`mailto:${a.contact_email}`} style={{ display: "inline-flex", alignItems: "center", gap: ".2rem", fontSize: ".65rem", fontWeight: 700, color: "#0b1e3d", background: "#f0f4ff", borderRadius: 6, padding: ".2rem .5rem", textDecoration: "none" }}>
                      ✉️ {a.contact_email}
                    </a>
                  )}
                </div>
              )}

              {/* Note field */}
              {isNoteOpen ? (
                <div style={{ marginTop: ".3rem" }}>
                  <textarea
                    autoFocus
                    rows={2}
                    value={noteTexts[a.id] ?? ""}
                    onChange={e => setNoteTexts(t => ({ ...t, [a.id]: e.target.value }))}
                    placeholder="Add a note…"
                    style={{ width: "100%", boxSizing: "border-box", padding: ".45rem .65rem", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: ".8rem", color: "#111827", fontFamily: "inherit", resize: "vertical", lineHeight: 1.5, outline: "none" }}
                  />
                  <div style={{ display: "flex", gap: ".4rem", marginTop: ".3rem" }}>
                    <button
                      onClick={() => saveNote(a.id)}
                      disabled={!noteTexts[a.id]?.trim() || isSaving}
                      style={{ padding: ".3rem .8rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 7, fontSize: ".75rem", fontWeight: 700, cursor: (!noteTexts[a.id]?.trim() || isSaving) ? "not-allowed" : "pointer", opacity: (!noteTexts[a.id]?.trim() || isSaving) ? .5 : 1 }}
                    >
                      Save Note
                    </button>
                    <button
                      onClick={() => { setExpandedNotes(s => { const n = new Set(s); n.delete(a.id); return n; }); setNoteTexts(t => ({ ...t, [a.id]: "" })); }}
                      style={{ padding: ".3rem .8rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 7, fontSize: ".75rem", fontWeight: 600, cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setExpandedNotes(s => new Set([...s, a.id]))}
                  style={{ background: "none", border: "none", padding: 0, fontSize: ".68rem", fontWeight: 600, color: "#9ca3af", cursor: "pointer" }}
                >
                  + {outreach?.note ? "Edit note" : "Add note"}
                </button>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Pace card ─────────────────────────────────────────────────────────────────

function PaceCard({ pace, primary }: { pace: PaceData; primary: string }) {
  if (!pace) return null;

  const rows = [
    { label: "Daily pace needed",  value: fmtDay(pace.neededPerDay),    highlight: false },
    { label: "Current pace",       value: fmtDay(pace.currentPerDay),   highlight: true  },
    { label: "Projected finish",   value: fmt(pace.projectedFinish),     highlight: false },
    { label: "Days remaining",     value: `${pace.daysRemaining} days`, highlight: false },
  ];

  return (
    <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)", marginBottom: ".75rem" }}>
      <div style={{
        padding: ".75rem 1.25rem .55rem", borderBottom: "1px solid #f3f4f6",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em" }}>
          Fundraising Pace
        </span>
        <span style={{
          fontSize: ".65rem", fontWeight: 700, padding: ".18rem .55rem", borderRadius: 100,
          background: pace.onTrack ? "#d1fae5" : "#fee2e2",
          color:      pace.onTrack ? "#065f46" : "#dc2626",
        }}>
          {pace.onTrack ? "On track" : "Behind pace"}
        </span>
      </div>

      <div style={{ padding: ".5rem 0" }}>
        {rows.map((row, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: ".5rem 1.25rem",
            background: row.highlight ? `${primary}06` : "transparent",
          }}>
            <span style={{ fontSize: ".8rem", color: "#6b7280" }}>{row.label}</span>
            <span style={{
              fontSize: ".88rem", fontWeight: 800,
              color: row.highlight ? primary : "#111827",
            }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Athlete progress ──────────────────────────────────────────────────────────

function AthleteProgressCard({
  athleteProgress,
  primary,
}: {
  athleteProgress: AthleteProgress[];
  primary:         string;
}) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)", marginBottom: ".75rem" }}>
      <div style={{
        padding: ".75rem 1.25rem .55rem", borderBottom: "1px solid #f3f4f6",
        display: "flex", alignItems: "center", gap: ".5rem",
      }}>
        <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em" }}>
          Athlete Progress
        </span>
        <span style={{ background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".1rem .4rem", lineHeight: 1.4 }}>
          {athleteProgress.length}
        </span>
      </div>

      <div style={{ padding: ".2rem 0" }}>
        {athleteProgress.map((a, i) => {
          const bg = avatarColor(a.name);
          return (
            <div
              key={a.id}
              style={{
                display: "flex", alignItems: "flex-start", gap: ".65rem",
                padding: ".65rem 1.25rem",
                borderBottom: i < athleteProgress.length - 1 ? "1px solid #f9fafb" : "none",
              }}
            >
              {/* Rank */}
              <div style={{ width: 20, fontWeight: 800, fontSize: ".68rem", color: a.rank <= 3 ? "#0b1e3d" : "#c4c9d4", flexShrink: 0, paddingTop: ".25rem", textAlign: "center" }}>
                #{a.rank}
              </div>

              {/* Avatar */}
              {a.profile_photo ? (
                <img src={a.profile_photo} alt={a.name} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".65rem", color: "#fff", flexShrink: 0 }}>
                  {initials(a.name)}
                </div>
              )}

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".15rem" }}>
                  <span style={{ fontWeight: 700, fontSize: ".84rem", color: "#0b1e3d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "58%" }}>
                    {a.name}
                  </span>
                  <span style={{ fontWeight: 800, fontSize: ".92rem", color: "#0b1e3d", flexShrink: 0 }}>
                    {fmt(a.raisedCents)}
                  </span>
                </div>

                <div style={{ fontSize: ".68rem", color: "#9ca3af", marginBottom: a.pct !== null ? ".3rem" : 0 }}>
                  {a.event}
                  {a.donorCount > 0 ? ` · ${a.donorCount} donor${a.donorCount !== 1 ? "s" : ""}` : " · No donors"}
                  {a.lastDonationAt && ` · Last: ${timeAgo(a.lastDonationAt)}`}
                </div>

                {a.pct !== null && (
                  <div>
                    <div style={{ height: 5, background: "#f3f4f6", borderRadius: 100, overflow: "hidden", marginBottom: ".2rem" }}>
                      <div style={{ height: "100%", width: `${a.pct}%`, background: primary, borderRadius: 100 }} />
                    </div>
                    <div style={{ fontSize: ".63rem", fontWeight: 700, color: primary }}>
                      {a.pct}% of goal
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

// ── Top donors ────────────────────────────────────────────────────────────────

function TopDonorsCard({ topDonors }: { topDonors: TopDonor[] }) {
  if (topDonors.length === 0) return null;

  return (
    <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)", marginBottom: ".75rem" }}>
      <div style={{
        padding: ".75rem 1.25rem .55rem", borderBottom: "1px solid #f3f4f6",
        display: "flex", alignItems: "center", gap: ".5rem",
      }}>
        <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em" }}>
          Top Donors
        </span>
        <span style={{ background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".1rem .4rem", lineHeight: 1.4 }}>
          {topDonors.length}
        </span>
      </div>

      <div style={{ padding: ".2rem 0" }}>
        {topDonors.map((d, i) => (
          <div
            key={i}
            style={{
              padding: ".6rem 1.25rem",
              borderBottom: i < topDonors.length - 1 ? "1px solid #f9fafb" : "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".18rem" }}>
              <span style={{ fontWeight: 700, fontSize: ".84rem", color: "#0b1e3d" }}>
                {d.name}
              </span>
              <span style={{ fontWeight: 800, fontSize: ".92rem", color: "#059669", flexShrink: 0 }}>
                {fmt(d.totalCents)}
              </span>
            </div>
            <div style={{ fontSize: ".68rem", color: "#9ca3af" }}>
              {d.donationCount} donation{d.donationCount !== 1 ? "s" : ""}
              {d.athletes.length > 0 && (
                <span> · <span style={{ color: "#6b7280" }}>→ {d.athletes.slice(0, 2).join(", ")}{d.athletes.length > 2 ? ` +${d.athletes.length - 2}` : ""}</span></span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Export card ───────────────────────────────────────────────────────────────

function ExportCard({ slug }: { slug: string }) {
  const btn: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: ".4rem",
    width: "100%", padding: ".7rem",
    background: "#f8f9fb", color: "#0b1e3d",
    border: "1.5px solid #e5e7eb", borderRadius: 10,
    fontSize: ".85rem", fontWeight: 600, textDecoration: "none", cursor: "pointer",
    boxSizing: "border-box",
  };

  return (
    <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)", marginBottom: ".75rem" }}>
      <div style={{ padding: ".75rem 1.25rem .55rem", borderBottom: "1px solid #f3f4f6" }}>
        <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em" }}>
          Export Data
        </span>
      </div>

      <div style={{ padding: ".875rem 1.25rem", display: "flex", flexDirection: "column", gap: ".55rem" }}>
        <a href={`/api/team/${slug}/analytics/export/donations`} style={btn}>
          ↓ Download Donations CSV
        </a>
        <a href={`/api/team/${slug}/analytics/export/athletes`} style={btn}>
          ↓ Download Athlete Report CSV
        </a>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AnalyticsView({
  slug,
  settings,
  teamStats,
  pace,
  athleteProgress,
  needsAttention,
  topDonors,
  outreachMap,
}: {
  slug:            string;
  settings:        CampaignSettings;
  teamStats:       TeamStats;
  pace:            PaceData;
  athleteProgress: AthleteProgress[];
  needsAttention:  AthleteProgress[];
  topDonors:       TopDonor[];
  outreachMap:     Record<string, OutreachCurrentRow>;
}) {
  const primary = settings.primary_color;

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* Back link + header */}
      <div style={{ marginBottom: ".75rem" }}>
        <a
          href={`/team/${slug}/fundraiser`}
          style={{ display: "inline-flex", alignItems: "center", gap: ".3rem", fontSize: ".78rem", fontWeight: 600, color: "#6b7280", textDecoration: "none", marginBottom: ".35rem" }}
        >
          ← Fundraiser
        </a>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em" }}>
          Analytics
        </h2>
      </div>

      <TeamOverviewCard teamStats={teamStats} settings={settings} />
      <NeedsAttentionCard needsAttention={needsAttention} slug={slug} initialOutreachMap={outreachMap} />
      <PaceCard pace={pace} primary={primary} />
      <AthleteProgressCard athleteProgress={athleteProgress} primary={primary} />
      <TopDonorsCard topDonors={topDonors} />
      <ExportCard slug={slug} />
    </div>
  );
}
