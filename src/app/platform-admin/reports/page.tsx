import ReportsQueueView from "./ReportsQueueView";

export const dynamic = "force-dynamic";

// Cross-campaign moderation queue for Platform Admins (Apple Guideline
// 1.2). Gated already by src/app/platform-admin/layout.tsx — every route
// under this tree requires a live platform_admins row, re-verified fresh
// per request, never trusted from a cookie.
export default function PlatformAdminReportsPage() {
  return <ReportsQueueView />;
}
