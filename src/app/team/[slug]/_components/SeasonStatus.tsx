"use client";

// Complete Season Phase 4 — the team's season status for client components.
// The team layout provides it once from campaign_settings; any control that
// would change a completed (archived) season's data reads useSeasonReadOnly()
// and hides itself. This is presentation only: the API routes
// (seasonWritable.ts) and the database guard still refuse every write.
// Without a provider (anything outside /team/[slug]) the season counts as
// active, so behavior there is unchanged.
import { createContext, useContext, type ReactNode } from "react";
import { Archive } from "lucide-react";

import { completedSeasonBannerText } from "@/lib/seasonState";

export type SeasonStatus = {
  /** True once the season has been completed (archived, read-only). */
  readOnly: boolean;
  /** campaign_settings.season_completed_at (ISO), if known. */
  completedAt: string | null;
};

const ACTIVE: SeasonStatus = { readOnly: false, completedAt: null };
const SeasonStatusContext = createContext<SeasonStatus>(ACTIVE);

export function SeasonStatusProvider({ status, children }: { status: SeasonStatus; children: ReactNode }) {
  return <SeasonStatusContext.Provider value={status}>{children}</SeasonStatusContext.Provider>;
}

export function useSeasonStatus(): SeasonStatus {
  return useContext(SeasonStatusContext);
}

/** True when this team's season is completed and its data must not be edited. */
export function useSeasonReadOnly(): boolean {
  return useContext(SeasonStatusContext).readOnly;
}

/** Renders its children only while the season is active — for server-rendered
 *  entry points (e.g. the Complete Season card) that would otherwise need
 *  their own season lookup. */
export function ActiveSeasonOnly({ children }: { children: ReactNode }) {
  return useContext(SeasonStatusContext).readOnly ? null : <>{children}</>;
}

/** The archived-season banner shown at the top of every completed-season page. */
export function CompletedSeasonBanner({ completedAt }: { completedAt: string | null }) {
  return (
    <div
      role="status"
      data-testid="completed-season-banner"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: ".55rem",
        margin: "0",
        padding: ".7rem 1rem",
        background: "#fff7e6",
        borderBottom: "1px solid #f3d9a4",
        color: "#7a4b00",
        fontSize: ".85rem",
        lineHeight: 1.45,
      }}
    >
      <Archive aria-hidden="true" size={18} strokeWidth={2} style={{ flexShrink: 0, marginTop: ".1rem" }} />
      <span>{completedSeasonBannerText(completedAt)}</span>
    </div>
  );
}
