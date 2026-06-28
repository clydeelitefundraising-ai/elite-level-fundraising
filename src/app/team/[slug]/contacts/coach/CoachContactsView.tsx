"use client";

import { useState, useEffect } from "react";
import type { AthleteSummary, CoachSummaryResponse } from "@/app/api/team/[slug]/contacts/coach/summary/route";

// ── Types ──────────────────────────────────────────────────────────────────────

type Contact = {
  id: string;
  phone: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  relationship: string | null;
  relationship_other: string | null;
  notes: string | null;
  added_by_type: "athlete" | "parent" | "coach";
  created_at: string;
};

// ── Styles ─────────────────────────────────────────────────────────────────────

const INP: React.CSSProperties = {
  padding: ".45rem .65rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: 8,
  fontSize: ".85rem",
  color: "#111827",
  background: "#fff",
  fontFamily: "inherit",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusStyle(status: AthleteSummary["status"]): { bg: string; color: string } {
  if (status === "Goal Met")    return { bg: "#d1fae5", color: "#065f46" };
  if (status === "In Progress") return { bg: "#fef3c7", color: "#92400e" };
  return { bg: "#f3f4f6", color: "#6b7280" };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

function displayRelationship(c: Contact): string {
  if (!c.relationship) return "";
  if (c.relationship === "Other" && c.relationship_other) return c.relationship_other;
  return c.relationship;
}

function displayContactName(c: Contact): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return name || c.phone || c.email || "Contact";
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ background: "#e5e7eb", borderRadius: 100, height: 6, overflow: "hidden", marginTop: ".25rem" }}>
      <div style={{
        background: color, borderRadius: 100, height: "100%",
        width: `${Math.min(100, Math.max(0, pct))}%`,
        transition: "width .4s ease",
      }} />
    </div>
  );
}

// ── Goal modal ─────────────────────────────────────────────────────────────────

function GoalModal({
  slug,
  isTeamDefault,
  athleteId,
  athleteName,
  currentGoal,
  onClose,
  onSaved,
}: {
  slug: string;
  isTeamDefault: boolean;
  athleteId: string | null;
  athleteName: string;
  currentGoal: number;
  onClose: () => void;
  onSaved: (athleteId: string | null, goal: number) => void;
}) {
  const [value, setValue] = useState(String(currentGoal));
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const handleSave = async () => {
    const goal = parseInt(value, 10);
    if (!Number.isInteger(goal) || goal < 1) {
      setError("Goal must be a positive number.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/team/${slug}/contacts/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, athlete_id: athleteId }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError((d as { error?: string }).error ?? "Failed to save goal.");
      return;
    }
    onSaved(athleteId, goal);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 16,
        padding: "1.25rem", width: "min(360px, 100%)",
        boxShadow: "0 8px 32px rgba(0,0,0,.18)",
      }}>
        <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0b1e3d", marginBottom: ".25rem" }}>
          {isTeamDefault ? "Set Team Default Goal" : `Set Goal: ${athleteName}`}
        </div>
        <p style={{ margin: "0 0 .85rem", fontSize: ".78rem", color: "#6b7280" }}>
          {isTeamDefault
            ? "Applies to all athletes without a custom goal."
            : "Overrides the team default for this athlete only."}
        </p>
        <label style={{ display: "flex", flexDirection: "column", gap: ".3rem", fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".05em" }}>
          Contact Goal
          <input
            type="number"
            min={1}
            value={value}
            onChange={e => setValue(e.target.value)}
            style={{ ...INP, fontSize: "1.1rem", fontWeight: 700, textAlign: "center" }}
            autoFocus
            onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
          />
        </label>
        {error && (
          <p style={{ margin: ".5rem 0 0", padding: ".4rem .6rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".78rem" }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: ".5rem", marginTop: ".85rem" }}>
          <button onClick={onClose} style={{ flex: 1, padding: ".6rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: ".6rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1 }}>
            {saving ? "Saving…" : "Save Goal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Athlete drill-down ────────────────────────────────────────────────────────

function AthleteContactList({
  slug,
  athleteId,
  primaryColor,
}: {
  slug: string;
  athleteId: string;
  primaryColor: string;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/team/${slug}/contacts/coach/athlete/${athleteId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setContacts(d?.contacts ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug, athleteId]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    setDeleting(id);
    const res = await fetch(`/api/team/${slug}/contacts/${id}`, { method: "DELETE" });
    if (res.ok) setContacts(prev => prev.filter(c => c.id !== id));
    setDeleting(null);
  };

  if (loading) return <div style={{ padding: ".75rem", textAlign: "center", fontSize: ".8rem", color: "#9ca3af" }}>Loading…</div>;
  if (contacts.length === 0) return <div style={{ padding: ".75rem", fontSize: ".82rem", color: "#9ca3af" }}>No contacts yet.</div>;

  return (
    <div style={{ padding: ".5rem 0" }}>
      {contacts.map(c => {
        const rel = displayRelationship(c);
        return (
          <div key={c.id} style={{ display: "flex", gap: ".65rem", alignItems: "flex-start", padding: ".55rem .75rem", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", background: primaryColor,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: ".78rem", color: "#fff", flexShrink: 0,
            }}>
              {displayContactName(c)[0]?.toUpperCase() ?? "?"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: ".85rem", color: "#0b1e3d" }}>{displayContactName(c)}</div>
              {rel && <div style={{ fontSize: ".7rem", color: "#6b7280" }}>{rel}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: ".05rem", marginTop: ".1rem" }}>
                {c.phone && <div style={{ fontSize: ".75rem", color: "#374151" }}>📱 {c.phone}</div>}
                {c.email && <div style={{ fontSize: ".75rem", color: "#374151", wordBreak: "break-all" }}>✉️ {c.email}</div>}
              </div>
              <div style={{ fontSize: ".65rem", color: "#b0b7c3", marginTop: ".1rem" }}>
                Added by {c.added_by_type} · {fmtDate(c.created_at)}
              </div>
            </div>
            <button
              onClick={() => handleDelete(c.id)}
              disabled={deleting === c.id}
              style={{
                background: "none", border: "1px solid #fecaca", borderRadius: 7,
                fontSize: ".65rem", fontWeight: 600, color: "#dc2626",
                padding: ".2rem .45rem", cursor: "pointer", flexShrink: 0,
                opacity: deleting === c.id ? .5 : 1,
              }}
            >
              Delete
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Athlete row ────────────────────────────────────────────────────────────────

function AthleteRow({
  a,
  slug,
  primaryColor,
  canSetGoals,
  onSetGoal,
  expanded,
  onToggle,
}: {
  a: AthleteSummary;
  slug: string;
  primaryColor: string;
  canSetGoals: boolean;
  onSetGoal: (a: AthleteSummary) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const st = statusStyle(a.status);
  const pct = a.completion_pct;

  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      marginBottom: ".5rem",
      overflow: "hidden",
    }}>
      {/* Main row */}
      <div
        onClick={onToggle}
        style={{
          padding: ".85rem 1rem",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: ".65rem" }}>
          {/* Name + status */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".2rem" }}>
              <span style={{ fontWeight: 700, fontSize: ".9rem", color: "#0b1e3d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.athlete_name}
              </span>
              <span style={{
                flexShrink: 0,
                padding: ".1rem .42rem", borderRadius: 100,
                fontSize: ".58rem", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: ".04em",
                background: st.bg, color: st.color,
              }}>
                {a.status}
              </span>
            </div>
            <ProgressBar pct={pct} color={a.status === "Goal Met" ? "#059669" : primaryColor} />
          </div>

          {/* Stats column */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#0b1e3d", lineHeight: 1 }}>
              {a.reachable_count}
              <span style={{ fontWeight: 400, fontSize: ".72rem", color: "#9ca3af" }}> / {a.goal}</span>
            </div>
            <div style={{ fontSize: ".62rem", color: "#9ca3af", marginTop: ".1rem" }}>{pct}%</div>
          </div>

          <div style={{ color: "#9ca3af", fontSize: ".75rem", flexShrink: 0 }}>
            {expanded ? "▲" : "▼"}
          </div>
        </div>

        {/* Sub-stats */}
        <div style={{ display: "flex", gap: ".75rem", marginTop: ".55rem" }}>
          <div style={{ fontSize: ".68rem", color: "#6b7280" }}>📱 {a.phone_count}</div>
          <div style={{ fontSize: ".68rem", color: "#6b7280" }}>✉️ {a.email_count}</div>
          <div style={{ fontSize: ".68rem", color: "#6b7280" }}>Both: {a.both_count}</div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: ".68rem", color: "#9ca3af" }}>
            {a.last_added ? `Last: ${fmtDate(a.last_added)}` : "None yet"}
          </div>
          {canSetGoals && (
            <button
              onClick={e => { e.stopPropagation(); onSetGoal(a); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: ".65rem", fontWeight: 700, color: "#1d4ed8",
                padding: "0", lineHeight: 1.4,
              }}
            >
              Set Goal
            </button>
          )}
        </div>
      </div>

      {/* Expanded contact list */}
      {expanded && (
        <div style={{ borderTop: "1px solid #f3f4f6", background: "#fafafa" }}>
          <AthleteContactList slug={slug} athleteId={a.athlete_id} primaryColor={primaryColor} />
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CoachContactsView({
  slug,
  primaryColor,
  canSetGoals,
}: {
  slug: string;
  primaryColor: string;
  canSetGoals: boolean;
}) {
  const [data, setData]           = useState<CoachSummaryResponse | null>(null);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [goalModal, setGoalModal] = useState<{ isTeamDefault: boolean; athleteId: string | null; athleteName: string; currentGoal: number } | null>(null);

  useEffect(() => {
    fetch(`/api/team/${slug}/contacts/coach/summary`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  const handleGoalSaved = (athleteId: string | null, goal: number) => {
    if (!data) return;
    if (athleteId === null) {
      // Team default changed: update all athletes not having custom goals
      // Refetch for simplicity
      fetch(`/api/team/${slug}/contacts/coach/summary`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setData(d); });
    } else {
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          team_goal: prev.team_goal - (prev.athletes.find(a => a.athlete_id === athleteId)?.goal ?? 0) + goal,
          athletes: prev.athletes.map(a =>
            a.athlete_id === athleteId
              ? { ...a, goal, completion_pct: Math.min(100, Math.round((a.reachable_count / goal) * 100)) }
              : a,
          ),
        };
      });
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "3rem", color: "#9ca3af", fontSize: ".9rem" }}>
        Loading…
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#dc2626", fontSize: ".85rem" }}>
        Failed to load contact data.
      </div>
    );
  }

  const teamPct = data.team_goal > 0
    ? Math.min(100, Math.round((data.team_reachable / data.team_goal) * 100))
    : 0;

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* Back link */}
      <a
        href={`/team/${slug}/home`}
        style={{
          display: "inline-flex", alignItems: "center", gap: ".3rem",
          fontSize: ".8rem", fontWeight: 600, color: "#6b7280",
          textDecoration: "none", marginBottom: ".875rem",
        }}
      >
        ← Home
      </a>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: ".75rem" }}>
        <div>
          <div style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: ".1rem" }}>
            Coach Dashboard
          </div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em" }}>
            Fundraising Contacts
          </h1>
        </div>
        <a
          href={`/api/team/${slug}/contacts/export`}
          style={{
            padding: ".45rem .9rem", background: "#f3f4f6", color: "#374151",
            borderRadius: 9, fontSize: ".78rem", fontWeight: 700,
            textDecoration: "none", whiteSpace: "nowrap",
          }}
        >
          Export CSV
        </a>
      </div>

      {/* Team total card */}
      <div style={{
        background: primaryColor,
        borderRadius: 14,
        padding: "1.1rem 1.25rem",
        marginBottom: ".75rem",
        color: "#fff",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: ".55rem" }}>
          <div>
            <div style={{ fontSize: ".62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", opacity: .7, marginBottom: ".2rem" }}>
              Team Goal
            </div>
            <div style={{ fontWeight: 800, fontSize: "1rem", opacity: .85 }}>
              {data.team_goal.toLocaleString()} Contacts
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 800, fontSize: "1.75rem", lineHeight: 1 }}>
              {data.team_reachable.toLocaleString()}
            </div>
            <div style={{ fontSize: ".62rem", opacity: .7, marginTop: ".1rem" }}>collected</div>
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,.25)", borderRadius: 100, height: 8, overflow: "hidden", marginBottom: ".3rem" }}>
          <div style={{
            background: "#fff", borderRadius: 100, height: "100%",
            width: `${teamPct}%`, transition: "width .5s ease",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: ".7rem", opacity: .8 }}>
            📱 {data.team_phone} phone · ✉️ {data.team_email} email
          </div>
          <div style={{ fontSize: ".75rem", fontWeight: 700 }}>{teamPct}%</div>
        </div>

        {canSetGoals && (
          <button
            onClick={() => setGoalModal({ isTeamDefault: true, athleteId: null, athleteName: "Team", currentGoal: data.team_goal })}
            style={{
              marginTop: ".65rem",
              background: "rgba(255,255,255,.18)",
              border: "1px solid rgba(255,255,255,.35)",
              color: "#fff",
              borderRadius: 8,
              padding: ".35rem .8rem",
              fontSize: ".72rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Set Team Goal
          </button>
        )}
      </div>

      {/* Athlete rows */}
      {data.athletes.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "2.5rem 1.5rem",
          textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: ".65rem", opacity: .35 }}>👥</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151" }}>No athletes found</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".45rem" }}>
            {data.athletes.length} Athletes · Tap to view contacts
          </div>
          {data.athletes.map(a => (
            <AthleteRow
              key={a.athlete_id}
              a={a}
              slug={slug}
              primaryColor={primaryColor}
              canSetGoals={canSetGoals}
              onSetGoal={athlete => setGoalModal({
                isTeamDefault: false,
                athleteId: athlete.athlete_id,
                athleteName: athlete.athlete_name,
                currentGoal: athlete.goal,
              })}
              expanded={expanded === a.athlete_id}
              onToggle={() => setExpanded(prev => prev === a.athlete_id ? null : a.athlete_id)}
            />
          ))}
        </>
      )}

      {/* Goal modal */}
      {goalModal && (
        <GoalModal
          slug={slug}
          isTeamDefault={goalModal.isTeamDefault}
          athleteId={goalModal.athleteId}
          athleteName={goalModal.athleteName}
          currentGoal={goalModal.currentGoal}
          onClose={() => setGoalModal(null)}
          onSaved={handleGoalSaved}
        />
      )}
    </div>
  );
}
