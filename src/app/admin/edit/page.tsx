// @deprecated — legacy single-page campaign editor, superseded by
// /admin/campaigns/[slug] (CampaignControlCenter.tsx), the canonical admin
// campaign-management console as of the Phase A consolidation.
//
// Still the only place to manage Fund Uses and Team Coaches (not yet ported)
// — do not remove until those move over and this has zero remaining unique
// capabilities. Sponsors and Athletes have already been migrated to
// CampaignControlCenter; this page's copies of those sections are dead code
// paths kept only for reference until removal.
import { AdminDashboard } from "../AdminClient";

export const dynamic = "force-dynamic";

export default function AdminEditPage() {
  return <AdminDashboard />;
}
