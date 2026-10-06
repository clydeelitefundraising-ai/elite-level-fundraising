import { redirect } from "next/navigation";
import { getAccountSession } from "@/lib/accountSession";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { resolvePlatformAdminGateRedirect } from "@/lib/platformAdminLanding";
import { countNewFundraisingInquiries } from "@/lib/platform/fundraisingInquiries";
import PlatformAdminHeader from "./_components/PlatformAdminHeader";

export const dynamic = "force-dynamic";

/** Server-side gate for the entire /platform-admin/* tree.
 *
 *  Role is resolved fresh from the platform_admins table on every request —
 *  never trusted from a cookie value or any client-supplied state. A normal
 *  coach/parent/athlete/booster account, even if logged in, is redirected
 *  away exactly like an anonymous visitor for any route under this layout.
 *  The actual redirect decision lives in resolvePlatformAdminGateRedirect()
 *  (pure, unit-tested) — this just resolves the two booleans and acts on it.
 */
export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = await getAccountSession();
  const platformAdmin = account ? await getPlatformAdminSession() : null;

  const redirectTo = resolvePlatformAdminGateRedirect({
    hasAccount:      Boolean(account),
    isPlatformAdmin: Boolean(platformAdmin),
  });
  if (redirectTo) redirect(redirectTo);

  // Phase F1d — plain server-render count (no realtime/polling needed at
  // this feature's expected volume), fetched alongside the gate check so
  // the header never makes a second round-trip for it.
  const newInquiryCount = await countNewFundraisingInquiries();

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6f8", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <PlatformAdminHeader name={platformAdmin!.name} email={platformAdmin!.email} newInquiryCount={newInquiryCount} />
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "1.25rem 1rem 3rem" }}>
        {children}
      </main>
    </div>
  );
}
