"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AttributionTotals } from "@/lib/donationAttribution";
import type { OutreachCurrentRow } from "@/lib/teamData";
import styles from "./Team.module.css";
import type { AthleteRosterState } from "./useAthleteRoster";
import {
  buildDesktopRosterRows,
  filterDesktopRosterRows,
  sortDesktopRosterRows,
  distinctGrades,
  DEFAULT_ROSTER_FILTERS,
  type RosterRow,
  type RosterSort,
  type FundraisingFilter,
} from "./rosterHelpers";

function fmtMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

// D3a: only the three real logged statuses get a (restrained) pill —
// "No outreach logged" renders as plain muted text instead (see the
// table body below), so a roster full of never-contacted athletes isn't
// dominated by identical heavy badges.
const OUTREACH_TONE: Partial<Record<RosterRow["outreachStatus"], { bg: string; color: string }>> = {
  "Contacted": { bg: "#dbeafe", color: "#1d4ed8" },
  "Follow Up": { bg: "#fef3c7", color: "#b45309" },
  "Resolved":  { bg: "#dcfce7", color: "#15803d" },
};

const th: React.CSSProperties = {
  textAlign: "left", padding: ".65rem .75rem", fontSize: ".68rem", fontWeight: 700,
  color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em",
  borderBottom: "1.5px solid #f0f0f0", whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: ".65rem .75rem", fontSize: ".85rem", color: "#111827",
  borderBottom: "1px solid #f3f4f6", verticalAlign: "middle",
};

const selectStyle: React.CSSProperties = {
  padding: ".45rem .65rem", borderRadius: 8, border: "1.5px solid #e5e7eb",
  fontSize: ".82rem", background: "#fff", color: "#374151",
};

/** Desktop coach roster workspace — search/filter/sort over the exact
 *  same athlete list the mobile grid uses (AthleteRosterGrid.tsx), plus
 *  the exact same shared roster state/handlers (useAthleteRoster.ts) for
 *  Edit/Remove, so there is one authoritative athlete-management
 *  workflow, not a second copy. The Add/Edit modal itself is NOT
 *  rendered here — see AthleteFormModal.tsx and its comment on why it
 *  must be mounted exactly once by the shared wrapper (TeamView.tsx),
 *  never independently by this component or AthleteRosterGrid.tsx. */
export default function DesktopRosterTable({
  slug,
  roster,
  attribution,
  contactCounts,
  outreachMap,
}: {
  slug: string;
  roster: AthleteRosterState;
  attribution: AttributionTotals;
  contactCounts: Record<string, number>;
  outreachMap: Record<string, OutreachCurrentRow>;
}) {
  const router = useRouter();
  const { staffMode, canDelete, athletes, openAdd, openEdit, handleDelete } = roster;

  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState(DEFAULT_ROSTER_FILTERS.grade);
  const [fundraising, setFundraising] = useState<FundraisingFilter>(DEFAULT_ROSTER_FILTERS.fundraising);
  const [sort, setSort] = useState<RosterSort>("name-asc");

  const allRows = useMemo(
    () => buildDesktopRosterRows(athletes, attribution, contactCounts, outreachMap),
    [athletes, attribution, contactCounts, outreachMap],
  );
  const gradeOptions = useMemo(() => distinctGrades(allRows), [allRows]);
  const filtered = useMemo(
    () => filterDesktopRosterRows(allRows, { search, grade, fundraising }),
    [allRows, search, grade, fundraising],
  );
  const rows = useMemo(() => sortDesktopRosterRows(filtered, sort), [filtered, sort]);

  const findAthlete = (id: string) => athletes.find(a => a.id === id);
  const hasActiveFilters = search.trim() !== "" || grade !== "" || fundraising !== "all";
  const clearFilters = () => { setSearch(""); setGrade(""); setFundraising("all"); };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* D3a: Remove starts neutral/subdued (color set via this class, not
          inline, so :hover/:focus-visible can override it) — the action
          itself, isHeadCoach gating, and the existing confirm() dialog in
          handleDelete are all unchanged. */}
      <style>{`
        .roster-remove-btn { color: #9ca3af; }
        .roster-remove-btn:hover, .roster-remove-btn:focus-visible { color: #dc2626; }
      `}</style>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1.25rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em" }}>
            Team Roster
          </h1>
          <div style={{ fontSize: ".82rem", color: "#6b7280", marginTop: ".15rem" }}>
            {athletes.length} athlete{athletes.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {staffMode && (
          <button
            onClick={openAdd}
            style={{
              padding: ".55rem 1.1rem", background: "#0b1e3d", color: "#fff",
              border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            + Add Athlete
          </button>
        )}
      </div>

      {/* Toolbar: search / filters / sort */}
      <div className={styles.toolbar} style={{ marginBottom: "1rem" }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search athletes…"
          style={{ ...selectStyle, flex: "0 1 42%", minWidth: 200 }}
        />
        <select value={grade} onChange={e => setGrade(e.target.value)} style={{ ...selectStyle, flex: "0 1 auto", minWidth: 140 }}>
          <option value="">All Grades</option>
          {gradeOptions.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={fundraising} onChange={e => setFundraising(e.target.value as FundraisingFilter)} style={{ ...selectStyle, flex: "0 1 auto", minWidth: 170 }}>
          <option value="all">All Fundraising</option>
          <option value="has-raised">Has Raised Funds</option>
          <option value="no-raised">No Funds Raised</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as RosterSort)} style={{ ...selectStyle, flex: "0 1 auto", minWidth: 190 }}>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="raised-desc">Amount Raised: High–Low</option>
          <option value="raised-asc">Amount Raised: Low–High</option>
        </select>
      </div>

      {/* Table / empty states */}
      {athletes.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "3.5rem 1.5rem", textAlign: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "2.25rem", marginBottom: ".75rem", opacity: .3 }}>👥</div>
          <div style={{ fontWeight: 700, fontSize: ".95rem", color: "#374151", marginBottom: ".3rem" }}>Team is empty</div>
          <div style={{ fontSize: ".85rem", color: "#9ca3af" }}>
            {staffMode ? "Add your first athlete above." : "Team roster coming soon."}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "3rem 1.5rem", textAlign: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: ".65rem", opacity: .3 }}>🔍</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
            No athletes match these filters
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{ marginTop: ".5rem", padding: ".4rem .9rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, fontSize: ".8rem", fontWeight: 600, cursor: "pointer" }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className={styles.tableWrap} style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Athlete</th>
                <th style={th}>Grade</th>
                <th style={th}>Event / Jersey</th>
                <th style={th}>Contacts</th>
                <th style={th}>Fundraising</th>
                <th style={th}>Outreach</th>
                <th style={{ ...th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const pct = row.goal_cents && row.goal_cents > 0
                  ? Math.min(100, Math.round((row.raisedCents / row.goal_cents) * 100))
                  : null;
                const tone = OUTREACH_TONE[row.outreachStatus];
                return (
                  <tr key={row.id}>
                    <td style={td}>
                      <button
                        onClick={() => staffMode && router.push(`/team/${slug}/team/${row.id}`)}
                        style={{
                          display: "flex", alignItems: "center", gap: ".6rem", background: "none", border: "none",
                          padding: 0, cursor: staffMode ? "pointer" : "default", textAlign: "left", font: "inherit",
                        }}
                        disabled={!staffMode}
                      >
                        {row.profile_photo ? (
                          <img src={row.profile_photo} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                        ) : (
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%", background: "#0b1e3d", color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".62rem", fontWeight: 800, flexShrink: 0,
                          }}>
                            {initials(row.name)}
                          </div>
                        )}
                        <span style={{ fontWeight: 700, color: "#0b1e3d" }}>{row.name}</span>
                      </button>
                    </td>
                    <td style={td}>{row.class_year || <span style={{ color: "#c1c7d0" }}>—</span>}</td>
                    <td style={td}>
                      {row.event || row.jersey_number != null ? (
                        <span>
                          {row.event || <span style={{ color: "#c1c7d0" }}>—</span>}
                          {row.jersey_number != null && <span style={{ color: "#9ca3af" }}> · #{row.jersey_number}</span>}
                        </span>
                      ) : (
                        <span style={{ color: "#c1c7d0" }}>—</span>
                      )}
                    </td>
                    <td style={td}>{row.contactCount}</td>
                    <td style={td}>
                      {/* D3a: $0 stays quiet (regular weight, muted color) —
                          only a positive raised amount earns the bold navy
                          treatment, so the eye is drawn to athletes who've
                          actually raised something. */}
                      <div style={row.raisedCents > 0
                        ? { fontWeight: 700, color: "#0b1e3d" }
                        : { fontWeight: 400, color: "#9ca3af" }
                      }>
                        {fmtMoney(row.raisedCents)}
                      </div>
                      {pct != null && (
                        <div style={{ background: "#eaecef", borderRadius: 100, height: 5, width: 80, overflow: "hidden", marginTop: ".25rem" }}>
                          <div style={{ background: "#0b1e3d", height: "100%", width: `${pct}%`, borderRadius: 100 }} />
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      {/* D3a: only the three real logged statuses get a
                          pill; "No outreach logged" is plain muted text so
                          a roster full of never-contacted athletes isn't
                          dominated by identical heavy badges. */}
                      {tone ? (
                        <span style={{
                          display: "inline-block", padding: ".15rem .5rem", borderRadius: 100,
                          fontSize: ".68rem", fontWeight: 600, background: tone.bg, color: tone.color,
                        }}>
                          {row.outreachStatus}
                        </span>
                      ) : (
                        <span style={{ fontSize: ".78rem", color: "#9ca3af" }}>{row.outreachStatus}</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {staffMode && (
                        <button
                          onClick={() => { const a = findAthlete(row.id); if (a) openEdit(a); }}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".78rem", fontWeight: 600, color: "#6b7280", padding: ".2rem .5rem" }}
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        // D3a: neutral by default — destructive red only
                        // appears on hover/focus (see the .roster-remove-btn
                        // rule below) — the action/gating/confirmation are
                        // all unchanged, only the resting-state color is.
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="roster-remove-btn"
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".78rem", fontWeight: 600, padding: ".2rem .5rem" }}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
