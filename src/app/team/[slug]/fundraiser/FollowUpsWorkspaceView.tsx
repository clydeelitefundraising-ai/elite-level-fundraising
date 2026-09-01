"use client";

import type { CampaignSettings } from "@/lib/supabase";
import type { FollowUpRow } from "@/lib/followUps";
import type { TeamActor } from "@/lib/permissions";
import { useFollowUpsWorkspace } from "./useFollowUpsWorkspace";
import { shouldShowDesktopFundraiserFollowUps } from "./fundraiserHelpers";
import FollowUpsView from "./FollowUpsView";
import DesktopFollowUpsView from "./DesktopFollowUpsView";
import FollowUpModals from "./FollowUpModals";
import PrintFollowUpsReport from "./PrintFollowUpsReport";
import styles from "./Fundraiser.module.css";

// D6: thin wrapper, mirrors D3's TeamView.tsx / D4's CalendarWorkspaceView.tsx
// / D5's UpdatesWorkspaceView.tsx. Calls useFollowUpsWorkspace() exactly
// ONCE and shares the resulting state/handlers with both the existing
// mobile presentation (FollowUpsView.tsx, unmodified in behavior) and the
// new desktop workspace (DesktopFollowUpsView.tsx) — one authoritative
// Follow-Ups workflow, two presentation surfaces.
// shouldShowDesktopFundraiserFollowUps(actor) (isCoachOnly, NOT isStaff)
// deliberately excludes boosters from the new desktop table, matching the
// exact boundary D2/D3/D4/D5 already established — boosters keep the
// existing Follow-Ups presentation, with their existing isStaff
// view/update/export/print access (see the Step 0 permission audit), at
// every width. permissions.ts is untouched.
//
// The Update/History modals are mounted EXACTLY ONCE here, not by either
// presentation individually — Modal.tsx renders via
// createPortal(document.body), so a display:none ancestor (the
// mobileOnly/desktopOnly CSS toggle) would NOT stop a duplicate instance
// from showing (see FollowUpModals.tsx's comment for the identical
// D3/D4/D5 precedent). The print block (.elf-followups-print /
// .elf-followups-noprint, also referenced by FundraiserTabs.tsx's own tab
// bar) is preserved exactly, wrapping BOTH presentations here instead of
// living inside the old single FollowUpsView.tsx body.
export default function FollowUpsWorkspaceView({
  slug,
  settings,
  initialRows,
  actor,
}: {
  slug: string;
  settings: CampaignSettings;
  initialRows: FollowUpRow[];
  actor: TeamActor;
}) {
  const workspace = useFollowUpsWorkspace(slug, settings, initialRows);
  const showDesktop = shouldShowDesktopFundraiserFollowUps(actor);

  return (
    <>
      {/* Phase 6 print architecture, unchanged — moved here from
          FollowUpsView.tsx since it must wrap BOTH presentation surfaces,
          not just the mobile one. Print always renders the current
          sorted+filtered visibleRows regardless of which presentation is
          on screen. */}
      <style>{`
        @media print {
          #elf-team-header, [role="navigation"] { display: none !important; }
          .elf-followups-noprint { display: none !important; }
          .elf-followups-print { display: block !important; }
        }
        @media screen {
          .elf-followups-print { display: none; }
        }
      `}</style>

      <div className="elf-followups-print">
        <PrintFollowUpsReport
          title={workspace.reportTitle}
          schoolName={settings.school_name}
          sportName={settings.sport_name}
          season={settings.season ?? null}
          rows={workspace.visibleRows}
          primaryColor={settings.primary_color}
        />
      </div>

      <div className="elf-followups-noprint">
        <div className={styles.mobileOnly}>
          <FollowUpsView workspace={workspace} />
        </div>
        {showDesktop && (
          <div className={styles.desktopOnly}>
            <DesktopFollowUpsView workspace={workspace} />
          </div>
        )}
      </div>

      {/* Rendered exactly once, shared by both presentation surfaces
          above regardless of which is CSS-visible. */}
      <FollowUpModals workspace={workspace} />
    </>
  );
}
