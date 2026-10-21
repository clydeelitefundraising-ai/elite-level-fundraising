import type { GridSlot } from "@/lib/platform/communityPartnerRotation";
import CommunityPartnerSlots from "@/components/communityPartners/CommunityPartnerSlots";

// Phase 2.2D-2 — shared by BOTH the mobile Home experience (HomeView.tsx's
// HomeContent, rendered at every width for non-coach-dashboard roles and
// below the 1024px breakpoint for everyone else) and the desktop
// CoachDashboard. Deliberately ONE component, not two near-duplicates —
// page.tsx resolves `slots` exactly once per request and hands the same
// array to both render paths, so there is no possibility of mobile and
// desktop disagreeing about which partner occupies which position; this
// component then renders that resolved list identically everywhere.
//
// Always renders all COMMUNITY_PARTNER_SLOT_COUNT (21) positions — seven
// full rows of three on a phone: the occupied slots first, in the
// position order resolveGridSlots() already sorted them into, then blank
// positions. The cards themselves are CommunityPartnerSlots, shared with
// the Partners tab and the public campaign page. Source order is still
// the definition of "position N": no layout uses explicit per-item grid
// placement.
export default function CommunityPartnerGrid({ slots }: { slots: GridSlot[] }) {
  return <CommunityPartnerSlots partners={slots.map(s => s.partner)} variant="app" />;
}
