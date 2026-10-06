import FundraisingInquiriesView from "./FundraisingInquiriesView";

export const dynamic = "force-dynamic";

// Phase F1d. Gated already by src/app/platform-admin/layout.tsx — every
// route under this tree requires a live platform_admins row, re-verified
// fresh per request, never trusted from a cookie. Same shape as
// /platform-admin/reports/page.tsx.
export default function FundraisingInquiriesPage() {
  return <FundraisingInquiriesView />;
}
