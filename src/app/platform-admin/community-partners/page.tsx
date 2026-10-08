import CommunityPartnersAdminView from "./CommunityPartnersAdminView";

export const dynamic = "force-dynamic";

// Phase 2.2A. Gated already by src/app/platform-admin/layout.tsx — every
// route under this tree requires a live platform_admins row, re-verified
// fresh per request, never trusted from a cookie. Same shape as
// /platform-admin/fundraising-inquiries/page.tsx: no server-side data
// fetch here — the client view fetches its own list from
// /api/platform-admin/community-partners, which independently re-verifies
// the session itself.
export default function CommunityPartnersPage() {
  return <CommunityPartnersAdminView />;
}
