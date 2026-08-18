// Phase 6: Fundraiser Follow-Ups — pure, roster-first data shaping.
//
// THE ROSTER IS THE SOURCE OF TRUTH FOR WHO APPEARS. buildFollowUpRows
// always starts from `athletes` (the complete getTeamAthletes(slug)
// result) and enriches each row by looking values up FROM the other
// datasets BY athlete id — it never iterates contacts/donations/outreach
// and joins outward to athletes. A roster athlete with no account, no
// contacts, no donations, and no outreach history still produces a row:
// {contacts: 0, raisedCents: 0, outreachStatus: null}.
import type { TeamAthleteRow, OutreachCurrentRow } from "./teamData.ts";
import type { DonationRow } from "./supabase.ts";
import { attributeDonationsToAthletes } from "./donationAttribution.ts";
import { sanitizeFilenameSegment } from "./teamJoinQr.ts";

export type FollowUpRow = {
  id:             string;
  name:           string;
  contacts:       number;
  raisedCents:    number;
  outreachStatus: OutreachCurrentRow["status"] | null;
  outreachNote:   string | null;
  outreachAt:     string | null;
};

export function buildFollowUpRows(
  athletes: TeamAthleteRow[],
  donations: DonationRow[],
  contactCounts: Record<string, number>,
  outreachMap: Record<string, OutreachCurrentRow>,
): FollowUpRow[] {
  const { totalsCents } = attributeDonationsToAthletes(athletes, donations);

  return athletes.map(a => {
    const outreach = outreachMap[a.id] ?? null;
    return {
      id:             a.id,
      name:           a.name,
      contacts:       contactCounts[a.id] ?? 0,
      raisedCents:    totalsCents[a.id] ?? 0,
      outreachStatus: outreach?.status ?? null,
      outreachNote:   outreach?.note ?? null,
      outreachAt:     outreach?.created_at ?? null,
    };
  });
}

// ── Sorting / filtering ──────────────────────────────────────────────────

export type FollowUpSort = "contacts_asc" | "contacts_desc" | "raised_asc" | "raised_desc";
export type FollowUpFilter = "all" | "needs_follow_up";

export const DEFAULT_FOLLOW_UP_SORT: FollowUpSort = "contacts_asc";

export function sortFollowUpRows(rows: FollowUpRow[], sort: FollowUpSort): FollowUpRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "contacts_asc":  sorted.sort((a, b) => a.contacts - b.contacts); break;
    case "contacts_desc": sorted.sort((a, b) => b.contacts - a.contacts); break;
    case "raised_asc":    sorted.sort((a, b) => a.raisedCents - b.raisedCents); break;
    case "raised_desc":   sorted.sort((a, b) => b.raisedCents - a.raisedCents); break;
  }
  return sorted;
}

export function filterFollowUpRows(rows: FollowUpRow[], filter: FollowUpFilter): FollowUpRow[] {
  if (filter === "needs_follow_up") return rows.filter(r => r.outreachStatus === "needs_follow_up");
  return rows;
}

// ── Print report title — reflects the currently active filter ──────────

export function buildFollowUpsReportTitle(filter: FollowUpFilter, filteredCount: number, totalCount: number): string {
  return filter === "needs_follow_up"
    ? `Needs Follow Up — ${filteredCount} of ${totalCount} Athletes`
    : "Fundraising Athlete Report";
}

// ── Follow-up status label (shared by the on-screen badge and the CSV) ──

export const FOLLOW_UP_STATUS_LABEL: Record<NonNullable<FollowUpRow["outreachStatus"]>, string> = {
  contacted:       "Contacted",
  needs_follow_up: "Needs Follow Up",
  resolved:        "Resolved",
};

export function followUpStatusLabel(status: FollowUpRow["outreachStatus"]): string {
  return status ? FOLLOW_UP_STATUS_LABEL[status] : "—";
}

// ── CSV export ────────────────────────────────────────────────────────────
//
// Excel-compatible UTF-8 CSV (no XLSX dependency — none exists in this
// repo's package.json, and this is a small enough export not to justify
// adding one). A leading UTF-8 BOM is required for Excel specifically to
// correctly detect UTF-8 (without it, Excel falls back to the system
// codepage and mangles any non-ASCII athlete name). CRLF line endings,
// per the RFC 4180 convention Excel expects.
//
// Deliberately takes `rows` as-is and does not sort/filter internally —
// the caller (FollowUpsView) passes the exact same sorted+filtered array
// already driving the on-screen list and the print report, so the
// exported file always matches the coach's current working view.
const CSV_HEADERS = ["Athlete Name", "Contacts Entered", "Amount Raised", "Follow-Up Status", "Last Follow-Up Date"];

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// Plain decimal (no currency symbol) so Excel treats the column as a
// sortable/summable number rather than text.
function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}

function csvDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function buildFollowUpsCsv(rows: FollowUpRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push([
      csvEscape(r.name),
      String(r.contacts),
      centsToDecimalString(r.raisedCents),
      csvEscape(followUpStatusLabel(r.outreachStatus)),
      csvDate(r.outreachAt),
    ].join(","));
  }
  // Leading UTF-8 BOM (U+FEFF) so Excel specifically detects UTF-8
  // correctly instead of falling back to the system codepage and
  // mangling non-ASCII athlete names. CRLF row endings, per the RFC 4180
  // convention Excel expects.
  const BOM = "﻿";
  return BOM + lines.join("\r\n") + "\r\n";
}

export function buildFollowUpsCsvFilename(schoolName: string, sportName: string): string {
  const parts = [schoolName, sportName].map(sanitizeFilenameSegment).filter(Boolean);
  const base = parts.join("-") || "team";
  return `${base}-fundraiser-followups.csv`;
}
