"use client";

import type { FollowUpSort, FollowUpFilter } from "@/lib/followUps";
import { FOLLOW_UP_STATUS_LABEL } from "@/lib/followUps";
import { STATUS_STYLE, SORT_OPTIONS, FOLLOWUP_FILTER_OPTIONS, fmtCents, fmtDate } from "./followUpsFormat";
import type { FollowUpsWorkspaceState } from "./useFollowUpsWorkspace";

// D6: mobile-only Follow-Ups presentation — extracted verbatim (identical
// styling/behavior) from this file's pre-D6 body. Row/sort/filter/modal
// state now lives in useFollowUpsWorkspace.ts, shared with the new
// desktop workspace; FollowUpsWorkspaceView.tsx renders this inside
// Fundraiser.module.css's .mobileOnly wrapper and owns the Update/History
// modals (FollowUpModals.tsx) and the print block itself, so neither is
// duplicated here.
export default function FollowUpsView({ workspace }: { workspace: FollowUpsWorkspaceState }) {
  const {
    rows, sort, setSort, filter, setFilter, visibleRows,
    openUpdate, openHistory, handleExport, handlePrint,
  } = workspace;

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".65rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em" }}>
          Follow-Ups
        </h2>
        <span style={{ background: "#f3f4f6", color: "#6b7280", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem" }}>
          {rows.length} athlete{rows.length !== 1 ? "s" : ""}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={handleExport} style={printBtn}>
          Export Athlete Report
        </button>
        <button onClick={handlePrint} style={printBtnGhost}>
          Print Athlete Report
        </button>
      </div>

      {/* ── Sort / Filter ── */}
      <div style={{ display: "flex", gap: ".5rem", marginBottom: ".75rem", flexWrap: "wrap" }}>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as FollowUpSort)}
          style={selectStyle}
          aria-label="Sort athletes"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

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
      </div>

      {/* ── List ── */}
      {visibleRows.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, padding: "2.5rem 1.5rem", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)" }}>
          <div style={{ fontSize: "1.75rem", marginBottom: ".5rem", opacity: .35 }}>✅</div>
          <p style={{ margin: 0, fontSize: ".85rem", color: "#9ca3af" }}>
            {filter === "needs_follow_up" ? "No athletes currently need follow-up." : "No athletes on the roster yet."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
          {visibleRows.map(r => {
            const badge = r.outreachStatus ? STATUS_STYLE[r.outreachStatus] : null;
            return (
              <div key={r.id} style={{
                background: "#fff", borderRadius: 12, padding: ".75rem .9rem",
                boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
                display: "flex", flexDirection: "column", gap: ".4rem",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: ".92rem", color: "#111827", flex: 1, minWidth: 120 }}>
                    {r.name}
                  </span>
                  {badge ? (
                    <span style={{ background: badge.bg, color: badge.color, borderRadius: 100, fontSize: ".62rem", fontWeight: 700, padding: ".15rem .55rem", textTransform: "uppercase", letterSpacing: ".03em" }}>
                      {FOLLOW_UP_STATUS_LABEL[r.outreachStatus!]}
                    </span>
                  ) : (
                    <span style={{ color: "#c1c7d0", fontSize: ".78rem" }}>—</span>
                  )}
                </div>

                <div style={{ display: "flex", gap: "1rem", fontSize: ".8rem", color: "#6b7280", flexWrap: "wrap" }}>
                  <span><strong style={{ color: "#111827" }}>{r.contacts}</strong> contact{r.contacts !== 1 ? "s" : ""}</span>
                  <span><strong style={{ color: "#111827" }}>{fmtCents(r.raisedCents)}</strong> raised</span>
                  {r.outreachAt && <span>Last: {fmtDate(r.outreachAt)}</span>}
                </div>

                <div style={{ display: "flex", gap: ".5rem" }}>
                  <button onClick={() => openUpdate(r)} style={smallBtn}>Update</button>
                  <button onClick={() => openHistory(r)} style={smallBtnGhost}>View History</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Style tokens ──────────────────────────────────────────────────────────

const printBtn: React.CSSProperties = {
  padding: ".45rem .8rem", background: "#0b1e3d", color: "#fff", border: "none",
  borderRadius: 8, fontSize: ".8rem", fontWeight: 700, cursor: "pointer",
};

const printBtnGhost: React.CSSProperties = {
  padding: ".45rem .8rem", background: "#f3f4f6", color: "#374151", border: "none",
  borderRadius: 8, fontSize: ".8rem", fontWeight: 700, cursor: "pointer",
};

const selectStyle: React.CSSProperties = {
  padding: ".45rem .65rem", border: "1.5px solid #e5e7eb", borderRadius: 9,
  fontSize: ".78rem", fontWeight: 600, color: "#374151", background: "#fff",
};

const smallBtn: React.CSSProperties = {
  padding: ".4rem .75rem", background: "#0b1e3d", color: "#fff", border: "none",
  borderRadius: 8, fontSize: ".76rem", fontWeight: 700, cursor: "pointer",
};

const smallBtnGhost: React.CSSProperties = {
  padding: ".4rem .75rem", background: "#f3f4f6", color: "#374151", border: "none",
  borderRadius: 8, fontSize: ".76rem", fontWeight: 700, cursor: "pointer",
};
