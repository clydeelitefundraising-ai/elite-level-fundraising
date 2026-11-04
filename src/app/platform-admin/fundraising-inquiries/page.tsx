import { requirePlatformAdminPage } from "@/lib/platformAdminPageGuard";
import FundraisingInquiriesView from "./FundraisingInquiriesView";

export const dynamic = "force-dynamic";

// Phase F1d. Gated already by src/app/platform-admin/layout.tsx — every
// route under this tree requires a live platform_admins row, re-verified
// fresh per request, never trusted from a cookie. Same shape as
// /platform-admin/moderation/page.tsx.
export default async function FundraisingInquiriesPage() {
  await requirePlatformAdminPage();
  return <FundraisingInquiriesView />;
}
