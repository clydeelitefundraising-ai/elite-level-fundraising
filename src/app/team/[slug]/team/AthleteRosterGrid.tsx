"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Users, ChevronRight, Pencil, Trash2, ClipboardList } from "lucide-react";
import type { TeamAthleteRow } from "@/lib/teamData";
import { ATHLETE_CLASS_OPTIONS } from "@/lib/supabase";
import CoachBar from "../_components/CoachBar";
import type { AthleteRosterState } from "./useAthleteRoster";

// Phase 5: replaces the previous 2-column padded-card grid with a
// compact, grouped, sports-roster-style list — same authoritative
// roster state/handlers (useAthleteRoster.ts via TeamView.tsx), same
// staffMode/canDelete/openAdd/openEdit/handleDelete behavior, same
// staff-vs-member profile-route split (/team/[slug]/team/[id] vs
// /athlete/[id]) as before. Search/grouping are purely client-side
// presentation over the already-loaded `athletes` array — no new
// query, no new backend work.

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

function avatarColor(name: string): string {
  const palette = ["#0b2044", "#92400e", "#1e3a8a", "#5b21b6", "#065f46", "#9f1239", "#1e4d7b", "#78350f"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[hash % palette.length];
}

/** Groups athletes by class_year, ordered Freshman→Senior (the canonical
 *  ATHLETE_CLASS_OPTIONS progression, same ordering rule DesktopRosterTable's
 *  distinctGrades() already uses for its grade filter) with any legacy/
 *  unrecognized value sorted after, and athletes with no class_year in a
 *  trailing ungrouped bucket. Grouping is purely a display concern — no
 *  new backend semantics, no data written anywhere. */
function groupByClass(athletes: TeamAthleteRow[]): { label: string; athletes: TeamAthleteRow[] }[] {
  const canonicalIndex = (v: string) => {
    const i = (ATHLETE_CLASS_OPTIONS as readonly string[]).indexOf(v);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  const groups = new Map<string, TeamAthleteRow[]>();
  const ungrouped: TeamAthleteRow[] = [];
  for (const a of athletes) {
    if (!a.class_year) { ungrouped.push(a); continue; }
    if (!groups.has(a.class_year)) groups.set(a.class_year, []);
    groups.get(a.class_year)!.push(a);
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    const ci = canonicalIndex(a[0]) - canonicalIndex(b[0]);
    return ci !== 0 ? ci : a[0].localeCompare(b[0]);
  });
  const result = ordered.map(([label, list]) => ({ label, athletes: list }));
  if (ungrouped.length > 0) result.push({ label: "Other", athletes: ungrouped });
  return result;
}

function AthleteRow({
  a,
  slug,
  staffMode,
  canDelete,
  onEdit,
  onDelete,
}: {
  a: TeamAthleteRow;
  slug: string;
  staffMode: boolean;
  canDelete: boolean;
  onEdit: (a: TeamAthleteRow) => void;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const bg = avatarColor(a.name);
  // Every row navigates somewhere real: staff go to the staff-facing
  // profile (edit-capable), everyone else goes to the existing public
  // athlete profile route — this route already exists and is safe for
  // any authenticated team member to view; the roster previously gave
  // non-staff rows no click target at all, this just wires the tap
  // target to the destination the two-tier profile architecture already
  // designates for them. No new route, no new permission.
  const destination = staffMode ? `/team/${slug}/team/${a.id}` : `/athlete/${a.id}`;
  const secondary = [a.class_year, a.event].filter(Boolean).join(" · ");

  return (
    <div
      onClick={() => router.push(destination)}
      className="elf-list-row elf-focus-ring"
      style={{ cursor: "pointer", gap: "var(--space-3)" }}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(destination); } }}
    >
      {a.profile_photo ? (
        <img
          src={a.profile_photo}
          alt=""
          style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: 40, height: 40, borderRadius: "50%", background: bg, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: ".72rem", color: "#fff", letterSpacing: ".02em",
        }}>
          {initials(a.name)}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-primary-app)", lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {a.name}
        </div>
        {secondary && (
          <div style={{ fontSize: ".76rem", color: "var(--text-muted-app)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {secondary}
          </div>
        )}
      </div>

      {a.jersey_number != null && (
        <span className="elf-badge" style={{ flexShrink: 0, background: "var(--surface-light-elevated)", color: "var(--text-secondary-app)" }}>
          #{a.jersey_number}
        </span>
      )}

      {staffMode && (
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <button
            aria-label={`Edit ${a.name}`}
            onClick={e => { e.stopPropagation(); onEdit(a); }}
            className="elf-focus-ring"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "var(--space-1)", color: "var(--text-muted-app)", display: "flex" }}
          >
            <Pencil size={15} />
          </button>
          {canDelete && (
            <button
              aria-label={`Remove ${a.name}`}
              onClick={e => { e.stopPropagation(); onDelete(a.id); }}
              className="roster-remove-btn elf-focus-ring"
              style={{ background: "none", border: "none", cursor: "pointer", padding: "var(--space-1)", display: "flex" }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}

      <ChevronRight size={16} aria-hidden="true" style={{ color: "var(--text-muted-app)", flexShrink: 0 }} />
    </div>
  );
}

export default function AthleteRosterGrid({
  slug,
  roster,
  pendingRequestCount = 0,
}: {
  slug: string;
  roster: AthleteRosterState;
  // The Requests Center (/team/[slug]/requests) is the canonical place to
  // review/approve pending athlete requests — this is only a small
  // contextual pointer, not the approval workflow itself.
  pendingRequestCount?: number;
}) {
  const { staffMode, canDelete, athletes, openAdd, openEdit, handleDelete } = roster;
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return athletes;
    return athletes.filter(a => a.name.toLowerCase().includes(q));
  }, [athletes, search]);

  const groups = useMemo(() => groupByClass(filtered), [filtered]);

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* Staff-only remove button starts neutral, red only on hover/focus —
          same restrained-destructive pattern already used by the desktop
          roster table. */}
      <style>{`
        .roster-remove-btn { color: var(--text-muted-app); }
        .roster-remove-btn:hover, .roster-remove-btn:focus-visible { color: var(--color-error); }
      `}</style>

      {canDelete && pendingRequestCount > 0 && (
        <a
          href={`/team/${slug}/requests`}
          className="elf-focus-ring"
          style={{
            display: "flex", alignItems: "center", gap: "var(--space-2)",
            background: "var(--surface-light)", borderRadius: "var(--radius-md)",
            padding: "var(--space-2) var(--space-3)", marginBottom: "var(--space-3)",
            textDecoration: "none", border: "1px solid var(--border-app)",
            borderLeft: "3px solid var(--color-error)",
          }}
        >
          <ClipboardList size={16} style={{ color: "var(--color-error)", flexShrink: 0 }} aria-hidden="true" />
          <span className="elf-badge" style={{ background: "var(--color-error)", color: "#fff", flexShrink: 0 }}>
            {pendingRequestCount}
          </span>
          <span style={{ flex: 1, fontSize: ".82rem", fontWeight: 700, color: "var(--text-primary-app)" }}>
            Pending athlete request{pendingRequestCount !== 1 ? "s" : ""} — review in Requests
          </span>
          <ChevronRight size={16} style={{ color: "var(--text-muted-app)" }} aria-hidden="true" />
        </a>
      )}

      {/* Section header */}
      <div style={{ marginBottom: "var(--space-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team
          </h2>
          {athletes.length > 0 && (
            <span className="elf-badge" style={{ background: "var(--surface-light-elevated)", color: "var(--text-secondary-app)" }}>
              {athletes.length} athlete{athletes.length !== 1 ? "s" : ""}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <CoachBar show={staffMode} label="Add Athlete" onAdd={openAdd} />
        </div>
      </div>

      {athletes.length > 0 && (
        <div style={{ position: "relative", marginBottom: "var(--space-4)" }}>
          <Search size={16} aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted-app)" }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search athletes…"
            aria-label="Search athletes"
            className="elf-focus-ring"
            style={{
              width: "100%", padding: "var(--space-2) var(--space-3) var(--space-2) 2.25rem",
              borderRadius: "var(--radius-md)", border: "1px solid var(--border-app)",
              fontSize: ".85rem", background: "var(--surface-light)", color: "var(--text-primary-app)",
            }}
          />
        </div>
      )}

      {athletes.length === 0 ? (
        <div className="elf-section-flat" style={{ textAlign: "center", padding: "var(--space-8) var(--space-4)" }}>
          <Users size={28} style={{ color: "var(--text-muted-app)", opacity: .5, marginBottom: "var(--space-2)" }} aria-hidden="true" />
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-primary-app)", marginBottom: "var(--space-1)" }}>
            No athletes yet.
          </div>
          {staffMode ? (
            <div style={{ fontSize: ".8rem", color: "var(--text-muted-app)" }}>Add your first athlete above.</div>
          ) : (
            <div style={{ fontSize: ".8rem", color: "var(--text-muted-app)" }}>Team roster coming soon.</div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="elf-section-flat" style={{ textAlign: "center", padding: "var(--space-6) var(--space-4)" }}>
          <Search size={24} style={{ color: "var(--text-muted-app)", opacity: .5, marginBottom: "var(--space-2)" }} aria-hidden="true" />
          <div style={{ fontWeight: 700, fontSize: ".86rem", color: "var(--text-primary-app)" }}>
            No athletes match your search.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          {groups.map(group => (
            <div key={group.label}>
              <div style={{
                display: "flex", alignItems: "baseline", gap: "var(--space-2)",
                paddingBottom: "var(--space-1)", marginBottom: "var(--space-1)",
                borderBottom: "1px solid var(--border-app)",
              }}>
                <span style={{ fontSize: ".7rem", fontWeight: 800, color: "var(--text-primary-app)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                  {group.label}
                </span>
                <span style={{ fontSize: ".72rem", color: "var(--text-muted-app)" }}>
                  {group.athletes.length}
                </span>
              </div>
              <div className="elf-section-flat" style={{ padding: 0 }}>
                {group.athletes.map(a => (
                  <AthleteRow
                    key={a.id}
                    a={a}
                    slug={slug}
                    staffMode={staffMode}
                    canDelete={canDelete}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
