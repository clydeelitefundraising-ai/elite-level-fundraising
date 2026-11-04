import { requirePlatformAdminPage } from "@/lib/platformAdminPageGuard";
import { countNewFundraisingInquiries } from "@/lib/platform/fundraisingInquiries";
import PlatformAdminShell from "./_components/PlatformAdminShell";

export const dynamic = "force-dynamic";

/** Server-side gate for the entire /platform-admin/* tree.
 *
 *  Role is resolved fresh from the platform_admins table on every request —
 *  never trusted from a cookie value or any client-supplied state. A normal
 *  coach/parent/athlete/booster account, even if logged in, is redirected
 *  away exactly like an anonymous visitor for any route under this layout.
 *  The check is requirePlatformAdminPage() (platformAdminPageGuard.ts; the
 *  redirect decision itself is the pure resolvePlatformAdminGateRedirect()).
 *  This layout is NOT the only gate: Next renders pages in parallel with
 *  their layout, so every page calls the same check before its own data.
 */
export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: every page under this layout runs the same check itself
  // before reading any data (see platformAdminPageGuard.ts for why).
  const platformAdmin = await requirePlatformAdminPage();

  // Phase F1d — plain server-render count (no realtime/polling needed at
  // this feature's expected volume), fetched alongside the gate check so
  // the header never makes a second round-trip for it.
  const newInquiryCount = await countNewFundraisingInquiries();

  return (
    <PlatformAdminShell name={platformAdmin.name} email={platformAdmin.email} newInquiryCount={newInquiryCount}>
      {children}
    </PlatformAdminShell>
  );
}
