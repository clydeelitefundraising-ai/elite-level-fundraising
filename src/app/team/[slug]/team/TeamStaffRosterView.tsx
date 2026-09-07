"use client";

import { useEffect, useState } from "react";
import type { StaffDisplayEntry, StaffDisplayRole } from "@/lib/staffAggregation";
import Avatar from "../messages/_shared/Avatar";

function roleLabel(role: StaffDisplayRole): string {
  if (role === "head_coach") return "Head Coach";
  if (role === "assistant_coach") return "Assistant Coach";
  return "Booster";
}

// Desktop-density revision: flattened from an individually-shadowed
// rounded card per person into a compact list row (same elf-list-row
// primitive AthleteRosterGrid.tsx's roster rows use, tokenized colors
// instead of hardcoded hex) — one row-group of people reads as a real
// sports-roster staff list rather than a stack of separate floating
// cards. No chevron/click affordance: unlike athlete rows, a StaffCard
// has no real navigation destination today (staff management itself
// lives on the separate /team/[slug]/staff page, linked above via
// "Manage Staff" for the Head Coach only) — adding one here would be a
// fake action, so this stays a plain, non-interactive row by design.
// Reuses the same Avatar component the messaging surfaces already use —
// photo when entry.photo_url is set (resolved server-side from
// elf_accounts.profile_photo_url via either source table, see
// src/lib/staffAggregation.ts), initials fallback otherwise. No second
// photo/avatar system.
function StaffRow({ entry }: { entry: StaffDisplayEntry }) {
  return (
    <div className="elf-list-row" style={{ gap: "var(--space-3)" }}>
      <Avatar name={entry.name} photoUrl={entry.photo_url} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: ".88rem", color: "var(--text-primary-app)" }}>{entry.name}</div>
      </div>
      <div style={{ fontSize: ".78rem", color: "var(--text-muted-app)", flexShrink: 0 }}>{roleLabel(entry.role)}</div>
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
    try {
      const res = await fetch(`/api/team/${slug}/staff-roster`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to load staff."); return; }
      setError("");
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
    <div style={{ animation: "elf-fadeUp .22s ease both", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: ".65rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team Staff
          </h2>
          <div style={{ flex: 1 }} />
          {canManageBoosterVisibility && (
            <a
              href={`/team/${slug}/staff`}
              className="elf-focus-ring"
              style={{ fontSize: ".78rem", fontWeight: 700, color: "var(--text-primary-app)", textDecoration: "none", padding: ".35rem .6rem", borderRadius: "var(--radius-md)", background: "var(--surface-light-elevated)" }}
            >
              Manage Staff
            </a>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "var(--radius-md)", padding: ".55rem .75rem", color: "var(--color-error)", fontSize: ".82rem", marginBottom: ".65rem" }}>
          {error}
        </div>
      )}

      {canManageBoosterVisibility && (
        <div style={{
          display: "flex", alignItems: "center", gap: ".75rem",
          background: "var(--surface-light)", border: "1px solid var(--border-app)", borderRadius: "var(--radius-lg)",
          padding: ".65rem .85rem", marginBottom: "1rem",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: ".82rem", color: "var(--text-primary-app)" }}>Show Booster in Staff Roster</div>
            <div style={{ fontSize: ".72rem", color: "var(--text-muted-app)", marginTop: ".1rem" }}>
              Display only — this never changes Booster access, permissions, or fundraising behavior.
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling}
            aria-pressed={showBooster}
            className="elf-focus-ring"
            style={{
              width: 44, height: 26, borderRadius: 100, border: "none", flexShrink: 0,
              cursor: toggling ? "not-allowed" : "pointer",
              background: showBooster ? "var(--team-primary)" : "var(--border-app)",
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
        <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-muted-app)", fontSize: ".85rem" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          <div>
            <div style={{
              fontSize: ".7rem", fontWeight: 800, color: "var(--text-primary-app)", textTransform: "uppercase", letterSpacing: ".06em",
              paddingBottom: "var(--space-1)", marginBottom: "var(--space-1)", borderBottom: "1px solid var(--border-app)",
            }}>
              Head Coach
            </div>
            {headCoach.length === 0 ? (
              <div style={{ fontSize: ".8rem", color: "var(--text-muted-app)", padding: ".3rem 0" }}>Not set.</div>
            ) : (
              <div className="elf-section-flat" style={{ padding: 0 }}>
                {headCoach.map(s => <StaffRow key={s.key} entry={s} />)}
              </div>
            )}
          </div>

          <div>
            <div style={{
              fontSize: ".7rem", fontWeight: 800, color: "var(--text-primary-app)", textTransform: "uppercase", letterSpacing: ".06em",
              paddingBottom: "var(--space-1)", marginBottom: "var(--space-1)", borderBottom: "1px solid var(--border-app)",
            }}>
              Assistant Coaches
            </div>
            {assistantCoaches.length === 0 ? (
              <div style={{ fontSize: ".8rem", color: "var(--text-muted-app)", padding: ".3rem 0" }}>No assistant coaches yet.</div>
            ) : (
              <div className="elf-section-flat" style={{ padding: 0 }}>
                {assistantCoaches.map(s => <StaffRow key={s.key} entry={s} />)}
              </div>
            )}
          </div>

          {boosters.length > 0 && (
            <div>
              <div style={{
                fontSize: ".7rem", fontWeight: 800, color: "var(--text-primary-app)", textTransform: "uppercase", letterSpacing: ".06em",
                paddingBottom: "var(--space-1)", marginBottom: "var(--space-1)", borderBottom: "1px solid var(--border-app)",
              }}>
                Booster
              </div>
              <div className="elf-section-flat" style={{ padding: 0 }}>
                {boosters.map(s => <StaffRow key={s.key} entry={s} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
