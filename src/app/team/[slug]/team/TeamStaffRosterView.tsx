"use client";

import { useEffect, useState } from "react";
import type { StaffDisplayEntry, StaffDisplayRole } from "@/lib/staffAggregation";

function roleLabel(role: StaffDisplayRole): string {
  if (role === "head_coach") return "Head Coach";
  if (role === "assistant_coach") return "Assistant Coach";
  return "Booster";
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <div style={{
      width: 40, height: 40, borderRadius: "50%", background: "#0b1e3d",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: ".9rem", color: "#fff", flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

function StaffCard({ entry }: { entry: StaffDisplayEntry }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: ".75rem",
      background: "#fff", borderRadius: 12, padding: ".75rem .9rem",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
    }}>
      <Avatar name={entry.name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: ".88rem", color: "#0b1e3d" }}>{entry.name}</div>
        <div style={{ fontSize: ".74rem", color: "#9ca3af" }}>{roleLabel(entry.role)}</div>
      </div>
    </div>
  );
}

// Phase 7: read-only aggregated Staff roster, visible to every team
// member. Sourced from GET /api/team/[slug]/staff-roster (both team_coaches
// and team_members boosters, deduped by account_id, filtered by the
// Booster visibility setting — see src/lib/staffAggregation.ts). The
// Head-Coach-only Booster visibility toggle lives here (natural home,
// per spec) rather than a separate Settings page. Full staff management
// (invite/remove) stays on the existing /team/[slug]/staff page — this
// view links to it for the Head Coach instead of duplicating that UI.
export default function TeamStaffRosterView({ slug }: { slug: string }) {
  const [staff, setStaff] = useState<StaffDisplayEntry[]>([]);
  const [canManageBoosterVisibility, setCanManageBoosterVisibility] = useState(false);
  const [showBooster, setShowBooster] = useState(true);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/team/${slug}/staff-roster`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to load staff."); return; }
      setStaff(data.staff ?? []);
      setCanManageBoosterVisibility(!!data.canManageBoosterVisibility);
      setShowBooster(data.showBoosterInStaffRoster !== false);
    } catch {
      setError("Network error loading staff.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async () => {
    const next = !showBooster;
    setToggling(true);
    setShowBooster(next); // optimistic — this is display-only, safe to flip immediately
    try {
      const res = await fetch(`/api/team/${slug}/settings/booster-visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show_booster_in_staff_roster: next }),
      });
      if (!res.ok) { setShowBooster(!next); return; }
      await load();
    } catch {
      setShowBooster(!next);
    } finally {
      setToggling(false);
    }
  };

  const headCoach = staff.filter(s => s.role === "head_coach");
  const assistantCoaches = staff.filter(s => s.role === "assistant_coach");
  const boosters = staff.filter(s => s.role === "booster");

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <div style={{ marginBottom: ".65rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team Staff
          </h2>
          <div style={{ flex: 1 }} />
          {canManageBoosterVisibility && (
            <a
              href={`/team/${slug}/staff`}
              style={{ fontSize: ".78rem", fontWeight: 700, color: "#0b1e3d", textDecoration: "none", padding: ".35rem .6rem", borderRadius: 8, background: "#f3f4f6" }}
            >
              Manage Staff
            </a>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: ".55rem .75rem", color: "#dc2626", fontSize: ".82rem", marginBottom: ".65rem" }}>
          {error}
        </div>
      )}

      {canManageBoosterVisibility && (
        <div style={{
          display: "flex", alignItems: "center", gap: ".75rem",
          background: "#f8f9fb", border: "1px solid #e5e7eb", borderRadius: 12,
          padding: ".65rem .85rem", marginBottom: "1rem",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: ".82rem", color: "#0b1e3d" }}>Show Booster in Staff Roster</div>
            <div style={{ fontSize: ".72rem", color: "#6b7280", marginTop: ".1rem" }}>
              Display only — this never changes Booster access, permissions, or fundraising behavior.
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling}
            aria-pressed={showBooster}
            style={{
              width: 44, height: 26, borderRadius: 100, border: "none", flexShrink: 0,
              cursor: toggling ? "not-allowed" : "pointer",
              background: showBooster ? "#0b1e3d" : "#d1d5db",
              position: "relative", transition: "background .15s ease",
              opacity: toggling ? .7 : 1,
            }}
          >
            <span style={{
              position: "absolute", top: 3, left: showBooster ? 21 : 3,
              width: 20, height: 20, borderRadius: "50%", background: "#fff",
              transition: "left .15s ease", boxShadow: "0 1px 3px rgba(0,0,0,.25)",
            }} />
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem 0", color: "#9ca3af", fontSize: ".85rem" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          <div>
            <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".4rem" }}>
              Head Coach
            </div>
            {headCoach.length === 0 ? (
              <div style={{ fontSize: ".8rem", color: "#9ca3af", padding: ".3rem 0" }}>Not set.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                {headCoach.map(s => <StaffCard key={s.key} entry={s} />)}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".4rem" }}>
              Assistant Coaches
            </div>
            {assistantCoaches.length === 0 ? (
              <div style={{ fontSize: ".8rem", color: "#9ca3af", padding: ".3rem 0" }}>No assistant coaches yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                {assistantCoaches.map(s => <StaffCard key={s.key} entry={s} />)}
              </div>
            )}
          </div>

          {boosters.length > 0 && (
            <div>
              <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".4rem" }}>
                Booster
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                {boosters.map(s => <StaffCard key={s.key} entry={s} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
