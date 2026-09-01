"use client";

import type { FollowUpSort, FollowUpFilter } from "@/lib/followUps";
import styles from "./Fundraiser.module.css";
import { STATUS_STYLE, SORT_OPTIONS, FOLLOWUP_FILTER_OPTIONS, fmtCents, fmtDate, desktopFollowUpStatusLabel } from "./followUpsFormat";
import type { FollowUpsWorkspaceState } from "./useFollowUpsWorkspace";

// D6: desktop-only Follow-Ups workspace — a dense, sortable table reusing
// the exact same data/handlers as the mobile card list
// (useFollowUpsWorkspace.ts), the exact same sort/filter options
// (followUpsFormat.ts, itself just labels over src/lib/followUps.ts's
// unmodified sortFollowUpRows/filterFollowUpRows), and the exact same
// Export/Print actions — nothing about the underlying Follow-Ups logic is
// reimplemented here, only the row/column presentation. Styled to match
// D3's DesktopRosterTable.tsx (same th/td tokens, same $0-muted/positive-
// bold fundraising treatment, same restrained per-status pill instead of
// a heavy badge on every row).
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

const smallBtn: React.CSSProperties = {
  padding: ".32rem .65rem", background: "#0b1e3d", color: "#fff", border: "none",
  borderRadius: 7, fontSize: ".72rem", fontWeight: 700, cursor: "pointer",
};

const smallBtnGhost: React.CSSProperties = {
  padding: ".32rem .65rem", background: "#f3f4f6", color: "#374151", border: "none",
  borderRadius: 7, fontSize: ".72rem", fontWeight: 700, cursor: "pointer",
};

export default function DesktopFollowUpsView({ workspace }: { workspace: FollowUpsWorkspaceState }) {
  const {
    rows, sort, setSort, filter, setFilter, visibleRows,
    openUpdate, openHistory, handleExport, handlePrint,
  } = workspace;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1.25rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em" }}>
            Follow-Ups
          </h1>
          <div style={{ fontSize: ".82rem", color: "#6b7280", marginTop: ".15rem" }}>
            {rows.length} athlete{rows.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={handleExport} style={smallBtn}>
          Export Athlete Report
        </button>
        <button onClick={handlePrint} style={smallBtnGhost}>
          Print Athlete Report
        </button>
      </div>

      {/* Toolbar: filter / sort — same existing options only */}
      <div className={styles.toolbar} style={{ marginBottom: "1rem" }}>
        <div role="tablist" aria-label="Filter athletes" style={{ display: "inline-flex", background: "#f3f4f6", borderRadius: 9, padding: 3, gap: 2 }}>
          {FOLLOWUP_FILTER_OPTIONS.map(f => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id as FollowUpFilter)}
              style={{
                padding: ".4rem .8rem", borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: ".78rem", fontWeight: 700,
                background: filter === f.id ? "#fff" : "transparent",
                color: filter === f.id ? "#0b1e3d" : "#6b7280",
                boxShadow: filter === f.id ? "0 1px 3px rgba(0,0,0,.1)" : "none",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as FollowUpSort)}
          style={{ ...selectStyle, minWidth: 240 }}
          aria-label="Sort athletes"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Table / empty state */}
      {visibleRows.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "2.5rem 1.5rem",
          textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "1.75rem", marginBottom: ".5rem", opacity: .35 }}>✅</div>
          <p style={{ margin: 0, fontSize: ".85rem", color: "#9ca3af" }}>
            {filter === "needs_follow_up" ? "No athletes currently need follow-up." : "No athletes on the roster yet."}
          </p>
        </div>
      ) : (
        <div className={styles.tableWrap} style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Athlete</th>
                <th style={th}>Contacts</th>
                <th style={th}>Raised</th>
                <th style={th}>Outreach Status</th>
                <th style={th}>Last Updated</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(r => {
                const tone = r.outreachStatus ? STATUS_STYLE[r.outreachStatus] : null;
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                    <td style={td}>{r.contacts}</td>
                    <td style={{ ...td, fontWeight: r.raisedCents > 0 ? 700 : 400, color: r.raisedCents > 0 ? "#0b1e3d" : "#9ca3af" }}>
                      {fmtCents(r.raisedCents)}
                    </td>
                    <td style={td}>
                      {tone ? (
                        <span style={{ display: "inline-block", padding: ".15rem .5rem", borderRadius: 100, fontSize: ".68rem", fontWeight: 600, background: tone.bg, color: tone.color }}>
                          {desktopFollowUpStatusLabel(r.outreachStatus)}
                        </span>
                      ) : (
                        <span style={{ fontSize: ".78rem", color: "#9ca3af" }}>{desktopFollowUpStatusLabel(r.outreachStatus)}</span>
                      )}
                    </td>
                    <td style={{ ...td, color: r.outreachAt ? "#111827" : "#9ca3af" }}>
                      {r.outreachAt ? fmtDate(r.outreachAt) : "—"}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: ".4rem" }}>
                        <button onClick={() => openUpdate(r)} style={smallBtn}>Update</button>
                        <button onClick={() => openHistory(r)} style={smallBtnGhost}>History</button>
                      </div>
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
