// Pure helpers for the Phase D2 desktop Coach Dashboard — extracted so
// eligibility, quick-action visibility, and card-data selection are
// directly unit-testable without any component-render infrastructure
// (matches the same pattern already used for the D1 desktop sidebar —
// see src/app/team/[slug]/_components/desktopNavItems.ts). CoachDashboard.tsx
// and HomeView.tsx are the only consumers.
// Relative (not "@/...") import — this file is imported directly by
// coachDashboard.test.ts, which runs under plain `node --test` with no
// bundler/tsconfig-paths resolution; every existing test-covered module
// in this codebase avoids a runtime "@/" import for the same reason
// (type-only "@/" imports are fine — they're erased entirely).
import { isStaff, isHeadCoach, isCoachOnly, type TeamActor } from "../../../../lib/permissions.ts";
import type { PendingRequestSummary } from "@/lib/platform/requests";

/** Whether this actor sees the desktop Coach Dashboard instead of the
 *  existing mobile-style HomeContent at desktop widths.
 *
 *  Deliberately NOT isStaff() — isStaff() also returns true for boosters,
 *  which is the correct (broader) permission for things like Calendar/
 *  Files/Announcements write access, but is NOT the desired product
 *  definition for who gets the command-center dashboard: boosters must
 *  keep seeing the regular Home experience even on desktop. isCoachOnly()
 *  already has exactly the right semantics (head_coach, assistant_coach,
 *  and platform_admin as head-coach-equivalent — excludes booster and
 *  every member role) — this function delegates to it rather than
 *  reimplementing the same role check, but is kept as its own named,
 *  dashboard-specific function so a future product divergence between
 *  "coach-only write access" and "sees the dashboard" never requires
 *  touching (or misreading the intent of) isCoachOnly() itself.
 *  permissions.ts and isStaff()'s existing semantics are untouched. */
export function shouldShowCoachDashboard(actor: TeamActor): boolean {
  return isCoachOnly(actor);
}

// ─── Quick actions ───────────────────────────────────────────────────────────

export type QuickActionKey = "post-announcement" | "add-event" | "send-message" | "manage-team";

export type QuickAction = {
  key: QuickActionKey;
  label: string;
  icon: string;
  href: string;
};

/** Builds the dashboard's quick-action shortcuts. Every action navigates
 *  to its EXISTING destination page/workflow — Post Announcement goes to
 *  Communications (not a Home-embedded modal; the mobile Home
 *  announcement Post/Edit/Delete modal/state is deliberately left
 *  untouched by D2), Add Event to Calendar, Send Message to Messages
 *  (its "+ New" recipient picker is existing in-page state there, not
 *  duplicated here), Manage Team to the Team page. No new routes, no new
 *  forms. Post Announcement/Add Event are gated by the EXISTING isStaff()
 *  helper (unchanged) — in practice always true for any actor who passed
 *  shouldShowCoachDashboard, since isCoachOnly() is already a subset of
 *  isStaff(), but the gate is kept explicit rather than assumed so this
 *  function's correctness doesn't silently depend on that subset
 *  relationship never changing. Send Message and Manage Team have no
 *  staff gate — any authenticated actor can already reach both today. */
export function buildQuickActions(slug: string, actor: TeamActor): QuickAction[] {
  const actions: QuickAction[] = [];

  if (isStaff(actor)) {
    actions.push({
      key: "post-announcement",
      label: "Post Announcement",
      icon: "📣",
      href: `/team/${slug}/communications?tab=updates`,
    });
    actions.push({
      key: "add-event",
      label: "Add Event",
      icon: "📅",
      href: `/team/${slug}/calendar`,
    });
  }

  actions.push({
    key: "send-message",
    label: "Send Message",
    icon: "💬",
    href: `/team/${slug}/messages`,
  });
  actions.push({
    key: "manage-team",
    label: "Manage Team",
    icon: "👥",
    href: `/team/${slug}/team`,
  });

  return actions;
}

// ─── Requests card ───────────────────────────────────────────────────────────

/** The Requests card is Head-Coach/Platform-Admin only (isHeadCoach()
 *  already treats platform_admin as head-coach-equivalent — unchanged,
 *  reused as-is) — an Assistant Coach dashboard simply omits this card
 *  rather than showing a disabled/placeholder one. Returns the full
 *  breakdown already produced by getPendingRequestSummary (no new
 *  query — see page.tsx) so the card can show athlete-request and
 *  comment-approval counts separately, not just a combined total. */
export function resolveRequestsCardData(
  actor: TeamActor,
  summary: PendingRequestSummary,
): PendingRequestSummary | null {
  return isHeadCoach(actor) ? summary : null;
}

// ─── Fundraising card ────────────────────────────────────────────────────────

/** Matches the existing mobile FundraiserSnapshot's exact rule
 *  (`if (raisedCents === 0) return null`) — the dashboard's Fundraising
 *  card and the mobile snapshot must never disagree about when there's
 *  "nothing to show yet." */
export function shouldShowFundraisingCard(raisedCents: number): boolean {
  return raisedCents > 0;
}
