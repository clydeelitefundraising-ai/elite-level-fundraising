"use client";

import type { FollowUpRow } from "@/lib/followUps";

function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

// Phase 6: dedicated print-only layout, same convention as Calendar's
// PrintMonthView.tsx and Team QR's PrintSignupSheet.tsx — presentational
// only, receives the CALLER's already sorted/filtered `rows` and renders
// them in that exact order (no independent re-sort/re-fetch), so the
// printed report always matches whatever the coach currently has on
// screen. Visibility is controlled by the parent's @media print /
// @media screen CSS class pair, not by this component.
export default function PrintFollowUpsReport({
  title,
  schoolName,
  sportName,
  season,
  rows,
  primaryColor,
}: {
  title: string;
  schoolName: string;
  sportName: string;
  season: string | null;
  rows: FollowUpRow[];
  primaryColor: string;
}) {
  const totalContacts = rows.reduce((s, r) => s + r.contacts, 0);
  const totalRaisedCents = rows.reduce((s, r) => s + r.raisedCents, 0);
  const generatedOn = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date());

  return (
    <div style={{ color: "#111", fontFamily: "Georgia, 'Times New Roman', serif", padding: ".5in .6in" }}>
      <div style={{ textAlign: "center", marginBottom: "1rem", borderBottom: `2px solid ${primaryColor || "#0b1e3d"}`, paddingBottom: ".6rem" }}>
        <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#6b7280" }}>
          Elite Level Fundraising
        </div>
        <h1 style={{ margin: ".25rem 0 0", fontSize: "1.35rem", fontWeight: 800, color: primaryColor || "#0b1e3d" }}>
          {[schoolName, sportName].filter(Boolean).join(" ")}
        </h1>
        {season && <div style={{ fontSize: ".85rem", color: "#374151" }}>{season}</div>}
        <div style={{ marginTop: ".4rem", fontSize: "1rem", fontWeight: 700, color: "#111" }}>{title}</div>
        <div style={{ fontSize: ".75rem", color: "#9ca3af", marginTop: ".15rem" }}>Generated {generatedOn}</div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", marginBottom: "1rem", fontSize: ".8rem", color: "#374151" }}>
        <span><strong>{rows.length}</strong> Athletes</span>
        <span><strong>{totalContacts}</strong> Contacts Entered</span>
        <span><strong>{fmtCents(totalRaisedCents)}</strong> Raised</span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem" }}>
        <thead style={{ display: "table-header-group" }}>
          <tr>
            <th style={thStyle}>Athlete</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Contacts Entered</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Amount Raised</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} style={{ breakInside: "avoid" }}>
              <td style={tdStyle}>{r.name}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{r.contacts}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{fmtCents(r.raisedCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: ".4rem .5rem", borderBottom: "2px solid #111",
  fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em",
};

const tdStyle: React.CSSProperties = {
  padding: ".4rem .5rem", borderBottom: "1px solid #e5e7eb",
};
