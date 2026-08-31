"use client";

import type { TeamAthleteRow } from "@/lib/teamData";
import type { OutreachCurrentRow } from "@/lib/teamData";
import type { AttributionTotals } from "@/lib/donationAttribution";
import type { TeamActor } from "@/lib/permissions";
import { useAthleteRoster } from "./useAthleteRoster";
import { shouldShowDesktopRoster } from "./rosterHelpers";
import AthleteRosterGrid from "./AthleteRosterGrid";
import DesktopRosterTable from "./DesktopRosterTable";
import AthleteFormModal from "./AthleteFormModal";
import styles from "./Team.module.css";

// D3: this is now a thin wrapper, not the roster UI itself (that's
// AthleteRosterGrid.tsx, an unmodified-in-behavior extraction of this
// file's pre-D3 body). It calls useAthleteRoster() exactly ONCE and
// shares the resulting state/handlers with both the mobile grid and the
// new desktop table — one authoritative athlete-management workflow, two
// presentation surfaces. shouldShowDesktopRoster(actor) (NOT isStaff)
// deliberately excludes boosters from the new desktop table, matching
// the exact boundary D2's Coach Dashboard already established
// (shouldShowCoachDashboard) — boosters keep the existing Team
// experience at every width. permissions.ts is untouched.
export default function TeamView({
  slug,
  initialAthletes,
  actor,
  pendingRequestCount = 0,
  attribution,
  contactCounts,
  outreachMap,
}: {
  slug: string;
  initialAthletes: TeamAthleteRow[];
  actor: TeamActor;
  pendingRequestCount?: number;
  attribution: AttributionTotals;
  contactCounts: Record<string, number>;
  outreachMap: Record<string, OutreachCurrentRow>;
}) {
  const roster = useAthleteRoster(slug, initialAthletes, actor);
  const showDesktop = shouldShowDesktopRoster(actor);

  return (
    <>
      <div className={styles.mobileOnly}>
        <AthleteRosterGrid slug={slug} roster={roster} pendingRequestCount={pendingRequestCount} />
      </div>
      {showDesktop && (
        <div className={styles.desktopOnly}>
          <DesktopRosterTable
            slug={slug}
            roster={roster}
            attribution={attribution}
            contactCounts={contactCounts}
            outreachMap={outreachMap}
          />
        </div>
      )}
      {/* Rendered exactly once, shared by both presentation surfaces above
          regardless of which is CSS-visible — see AthleteFormModal.tsx's
          comment on why this must never be duplicated. */}
      <AthleteFormModal roster={roster} />
    </>
  );
}
