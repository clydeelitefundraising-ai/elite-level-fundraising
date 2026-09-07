"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, Search } from "lucide-react";
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

// Phase 5: tokenized (was hardcoded #0b1e3d navy throughout) + Lucide
// icons (was 👥/🔍 emoji) + tighter row rhythm. Every piece of search/
// filter/sort/CRUD logic below is byte-identical to the pre-Phase-5
// version — this is a visual reskin only, same rosterHelpers.ts
// functions, same useAthleteRoster.ts state, same isStaff/isHeadCoach
// gating via `staffMode`/`canDelete`.

const OUTREACH_TONE: Partial<Record<RosterRow["outreachStatus"], { bg: string; color: string }>> = {
  "Contacted": { bg: "#dbeafe", color: "#1d4ed8" },
  "Follow Up": { bg: "#fef3c7", color: "#b45309" },
  "Resolved":  { bg: "#dcfce7", color: "#15803d" },
};

const th: React.CSSProperties = {
  textAlign: "left", padding: ".65rem .75rem", fontSize: ".68rem", fontWeight: 700,
  color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".05em",
  borderBottom: "1.5px solid var(--border-app)", whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: ".65rem .75rem", fontSize: ".85rem", color: "var(--text-primary-app)",
  borderBottom: "1px solid var(--border-app)", verticalAlign: "middle",
};

const selectStyle: React.CSSProperties = {
  padding: ".45rem .65rem", borderRadius: "var(--radius-md)", border: "1.5px solid var(--border-app)",
  fontSize: ".82rem", background: "var(--surface-light)", color: "var(--text-primary-app)",
};

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
      {/* Remove starts neutral/subdued, red only on hover/focus — the
          action itself, isHeadCoach gating, and the existing confirm()
          dialog in handleDelete are all unchanged. */}
      <style>{`
        .roster-remove-btn { color: var(--text-muted-app); }
        .roster-remove-btn:hover, .roster-remove-btn:focus-visible { color: var(--color-error); }
      `}</style>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1.25rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em" }}>
            Team Roster
          </h1>
          <div style={{ fontSize: ".82rem", color: "var(--text-secondary-app)", marginTop: ".15rem" }}>
            {athletes.length} athlete{athletes.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {staffMode && (
          <button
            onClick={openAdd}
            className="elf-focus-ring"
            style={{
              display: "inline-flex", alignItems: "center", gap: ".4rem",
              padding: ".55rem 1.1rem", background: "var(--team-primary)", color: "var(--team-primary-foreground)",
              border: "none", borderRadius: "var(--radius-md)", fontSize: ".85rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            <Plus size={16} aria-hidden="true" />
            Add Athlete
          </button>
        )}
      </div>

      {/* Toolbar: search / filters / sort */}
      <div className={styles.toolbar} style={{ marginBottom: "1rem" }}>
        <div style={{ position: "relative", flex: "0 1 42%", minWidth: 200 }}>
          <Search size={15} aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted-app)" }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search athletes…"
            aria-label="Search athletes"
            className="elf-focus-ring"
            style={{ ...selectStyle, width: "100%", paddingLeft: "1.9rem" }}
          />
        </div>
        <select value={grade} onChange={e => setGrade(e.target.value)} className="elf-focus-ring" style={{ ...selectStyle, flex: "0 1 auto", minWidth: 140 }}>
          <option value="">All Grades</option>
          {gradeOptions.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={fundraising} onChange={e => setFundraising(e.target.value as FundraisingFilter)} className="elf-focus-ring" style={{ ...selectStyle, flex: "0 1 auto", minWidth: 170 }}>
          <option value="all">All Fundraising</option>
          <option value="has-raised">Has Raised Funds</option>
          <option value="no-raised">No Funds Raised</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as RosterSort)} className="elf-focus-ring" style={{ ...selectStyle, flex: "0 1 auto", minWidth: 190 }}>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="raised-desc">Amount Raised: High–Low</option>
          <option value="raised-asc">Amount Raised: Low–High</option>
        </select>
      </div>

      {/* Table / empty states */}
      {athletes.length === 0 ? (
        <div className="elf-section-flat" style={{ padding: "3.5rem 1.5rem", textAlign: "center" }}>
          <Users size={30} style={{ color: "var(--text-muted-app)", opacity: .5, marginBottom: ".75rem" }} aria-hidden="true" />
          <div style={{ fontWeight: 700, fontSize: ".95rem", color: "var(--text-primary-app)", marginBottom: ".3rem" }}>Team is empty</div>
          <div style={{ fontSize: ".85rem", color: "var(--text-muted-app)" }}>
            {staffMode ? "Add your first athlete above." : "Team roster coming soon."}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="elf-section-flat" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
          <Search size={26} style={{ color: "var(--text-muted-app)", opacity: .5, marginBottom: ".65rem" }} aria-hidden="true" />
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-primary-app)", marginBottom: ".3rem" }}>
            No athletes match these filters
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="elf-focus-ring"
              style={{ marginTop: ".5rem", padding: ".4rem .9rem", background: "var(--surface-light-elevated)", color: "var(--text-primary-app)", border: "none", borderRadius: "var(--radius-md)", fontSize: ".8rem", fontWeight: 600, cursor: "pointer" }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className={styles.tableWrap} style={{ background: "var(--surface-light)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-app)" }}>
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
                        className="elf-focus-ring"
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
                            width: 32, height: 32, borderRadius: "50%", background: "var(--team-primary)", color: "var(--team-primary-foreground)",
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".62rem", fontWeight: 800, flexShrink: 0,
                          }}>
                            {initials(row.name)}
                          </div>
                        )}
                        <span style={{ fontWeight: 700, color: "var(--text-primary-app)" }}>{row.name}</span>
                      </button>
                    </td>
                    <td style={td}>{row.class_year || <span style={{ color: "var(--text-muted-app)" }}>—</span>}</td>
                    <td style={td}>
                      {row.event || row.jersey_number != null ? (
                        <span>
                          {row.event || <span style={{ color: "var(--text-muted-app)" }}>—</span>}
                          {row.jersey_number != null && <span style={{ color: "var(--text-muted-app)" }}> · #{row.jersey_number}</span>}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted-app)" }}>—</span>
                      )}
                    </td>
                    <td style={td}>{row.contactCount}</td>
                    <td style={td}>
                      {/* $0 stays quiet — only a positive raised amount
                          earns the bold treatment, so the eye is drawn to
                          athletes who've actually raised something. */}
                      <div style={row.raisedCents > 0
                        ? { fontWeight: 700, color: "var(--text-primary-app)" }
                        : { fontWeight: 400, color: "var(--text-muted-app)" }
                      }>
                        {fmtMoney(row.raisedCents)}
                      </div>
                      {pct != null && (
                        <div style={{ background: "var(--surface-light-elevated)", borderRadius: "var(--radius-full)", height: 5, width: 80, overflow: "hidden", marginTop: ".25rem" }}>
                          <div style={{ background: "var(--team-primary)", height: "100%", width: `${pct}%`, borderRadius: "var(--radius-full)" }} />
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      {/* Only the three real logged statuses get a pill;
                          "No outreach logged" is plain muted text so a
                          roster full of never-contacted athletes isn't
                          dominated by identical heavy badges. */}
                      {tone ? (
                        <span className="elf-badge" style={{ background: tone.bg, color: tone.color }}>
                          {row.outreachStatus}
                        </span>
                      ) : (
                        <span style={{ fontSize: ".78rem", color: "var(--text-muted-app)" }}>{row.outreachStatus}</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {staffMode && (
                        <button
                          onClick={() => { const a = findAthlete(row.id); if (a) openEdit(a); }}
                          className="elf-focus-ring"
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".78rem", fontWeight: 600, color: "var(--text-secondary-app)", padding: ".2rem .5rem" }}
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="roster-remove-btn elf-focus-ring"
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
