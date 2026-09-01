// Shared presentation constants/formatters for Fundraiser Follow-Ups —
// extracted so the mobile card list (FollowUpsView.tsx), the new desktop
// table (DesktopFollowUpsView.tsx), and the shared modals
// (FollowUpModals.tsx) all use the exact same status colors, sort/filter
// option labels, and date/currency formatting instead of three
// independent copies. None of this touches src/lib/followUps.ts's
// existing sort/filter/CSV/print logic — it is presentation-only.
import { followUpStatusLabel, type FollowUpRow, type FollowUpSort, type FollowUpFilter } from "../../../../lib/followUps.ts";

export const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  contacted:       { bg: "#f0f4ff", color: "#1d4ed8" },
  needs_follow_up: { bg: "#fef3c7", color: "#b45309" },
  resolved:        { bg: "#dcfce7", color: "#16a34a" },
};

export const SORT_OPTIONS: { value: FollowUpSort; label: string }[] = [
  { value: "contacts_asc",  label: "Contacts: Lowest → Highest" },
  { value: "contacts_desc", label: "Contacts: Highest → Lowest" },
  { value: "raised_asc",    label: "Funds Raised: Lowest → Highest" },
  { value: "raised_desc",   label: "Funds Raised: Highest → Lowest" },
];

export const FOLLOWUP_FILTER_OPTIONS: { id: FollowUpFilter; label: string }[] = [
  { id: "all",             label: "All Athletes" },
  { id: "needs_follow_up", label: "Needs Follow Up" },
];

export function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

/** Desktop-only status text — reuses the exact same underlying
 *  contacted/needs_follow_up/resolved labels as
 *  followUpStatusLabel()/FOLLOW_UP_STATUS_LABEL (unchanged, still what
 *  the CSV/print report and the mobile card use), but replaces that
 *  function's plain "—" for a null status with the truthful phrase "No
 *  outreach logged" — consistent with D3's audited Roster terminology:
 *  an athlete with no logged outreach record only proves no outreach
 *  ACTION has been logged, not that no outreach has happened. Does not
 *  alter src/lib/followUps.ts's followUpStatusLabel() itself, since that
 *  function's "—" output is still exactly what the CSV/print report and
 *  the (unmodified) mobile card display. */
export function desktopFollowUpStatusLabel(status: FollowUpRow["outreachStatus"]): string {
  return status ? followUpStatusLabel(status) : "No outreach logged";
}
