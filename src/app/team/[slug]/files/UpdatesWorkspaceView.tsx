"use client";

import type { AnnouncementRow, TeamFileRow } from "@/lib/teamData";
import type { TeamActor } from "@/lib/permissions";
import { useUpdatesWorkspace } from "./useUpdatesWorkspace";
import { shouldShowDesktopCommunications } from "../communications/communicationsHelpers";
import UpdatesView from "./UpdatesView";
import DesktopUpdatesView from "./DesktopUpdatesView";
import AnnouncementFormModal from "./AnnouncementFormModal";
import FilesView from "./FilesView";
import styles from "../communications/Communications.module.css";

// D5: thin wrapper, mirrors D3's TeamView.tsx / D4's CalendarWorkspaceView.tsx.
// Calls useUpdatesWorkspace() exactly ONCE and shares the resulting
// state/handlers with both the existing mobile presentation (UpdatesView.tsx,
// unmodified in behavior) and the new desktop workspace
// (DesktopUpdatesView.tsx) — one authoritative Updates workflow, two
// presentation surfaces. shouldShowDesktopCommunications(actor)
// (isCoachOnly, NOT isStaff) deliberately excludes boosters from the new
// desktop workspace, matching the exact boundary D2/D3/D4 already
// established — boosters keep the existing Communications presentation,
// with their existing isStaff Post/Edit permissions, at every width.
// permissions.ts is untouched.
//
// The Add/Edit modal is mounted EXACTLY ONCE here, not by either
// presentation individually — Modal.tsx renders via
// createPortal(document.body), so a display:none ancestor (the
// mobileOnly/desktopOnly CSS toggle) would NOT stop a duplicate instance
// from showing (see AnnouncementFormModal.tsx's comment for the identical
// D3/D4 precedent). CommentsSection (mounted per-card, inside UpdateCard)
// is untouched — only one presentation is ever CSS-visible at a time, so
// there is no divergence risk, exactly as D4 reasoned for DateGroupCard.
// The standalone Files section (FilesView.tsx) is ALSO mounted exactly
// once here, unconditionally below both presentations — unlike Add/Edit
// it isn't portal-based, but both the mobile and desktop trees are always
// mounted simultaneously for a desktop-eligible actor (only CSS visibility
// toggles), so rendering it inside each presentation would create two
// independent, divergent FilesView instances instead of one. This exactly
// preserves the pre-D5 behavior of a single Files section below the feed.
export default function UpdatesWorkspaceView({
  slug,
  initialUpdates,
  initialFiles,
  actor,
  athletes,
}: {
  slug: string;
  initialUpdates: AnnouncementRow[];
  initialFiles: TeamFileRow[];
  actor: TeamActor;
  athletes: { id: string; name: string }[];
}) {
  const workspace = useUpdatesWorkspace(slug, initialUpdates, actor);
  const showDesktop = shouldShowDesktopCommunications(actor);

  return (
    <>
      <div className={styles.mobileOnly}>
        <UpdatesView workspace={workspace} />
      </div>
      {showDesktop && (
        <div className={styles.desktopOnly}>
          <DesktopUpdatesView workspace={workspace} />
        </div>
      )}

      {/* Rendered exactly once, shared by both presentation surfaces above
          regardless of which is CSS-visible. */}
      <AnnouncementFormModal workspace={workspace} athletes={athletes} />

      {/* Rendered exactly once — see comment above. filesWrapDesktop only
          applies (at >=1024px) when this actor is desktop-eligible, so it
          lines up under DesktopUpdatesView's constrained feed; ineligible
          actors keep the existing full-width Files section unchanged. */}
      <div className={showDesktop ? styles.filesWrapDesktop : undefined} style={{ marginTop: "1.75rem" }}>
        <FilesView slug={slug} initialFiles={initialFiles} actor={actor} />
      </div>
    </>
  );
}
