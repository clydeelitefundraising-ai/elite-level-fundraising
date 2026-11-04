// Server-only. The authorization check every /platform-admin page (and the
// layout) runs FIRST — before reading any data.
//
// Why not just the layout: Next renders a route's layout and page in
// parallel. A redirect() thrown by the layout still lets the page render, and
// its output is streamed in the same response — so a signed-out request got a
// 307 to /login whose RSC payload already contained the page's data. Each page
// therefore checks for itself, before its first query; the layout keeps the
// same check as defense in depth.
//
// Only an individual Platform Admin account passes: the account session is
// resolved server-side and the platform_admins row is re-checked on every
// request (getPlatformAdminSession). The legacy shared /admin password
// (elf_admin cookie) is never consulted, so it can't open Platform Admin.
import { redirect } from "next/navigation";
import { getAccountSession } from "@/lib/accountSession";
import { getPlatformAdminSession, type PlatformAdminIdentity } from "@/lib/platformAdminSession";
import { resolvePlatformAdminGateRedirect } from "@/lib/platformAdminLanding";

/** The signed-in Platform Admin, or a redirect (thrown) to /login for no
 *  account and /teams for any other account. Never returns null. */
export async function requirePlatformAdminPage(): Promise<PlatformAdminIdentity> {
  const account = await getAccountSession();
  const admin = account ? await getPlatformAdminSession() : null;
  const redirectTo = resolvePlatformAdminGateRedirect({ hasAccount: Boolean(account), isPlatformAdmin: Boolean(admin) });
  if (redirectTo || !admin) redirect(redirectTo ?? "/login");
  return admin;
}
