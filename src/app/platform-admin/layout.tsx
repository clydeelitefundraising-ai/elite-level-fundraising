import { redirect } from "next/navigation";
import { getAccountSession } from "@/lib/accountSession";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";

export const dynamic = "force-dynamic";

/** Server-side gate for the entire /platform-admin/* tree.
 *
 *  Role is resolved fresh from the platform_admins table on every request —
 *  never trusted from a cookie value or any client-supplied state. A normal
 *  coach/parent/athlete/booster account, even if logged in, is redirected
 *  away exactly like an anonymous visitor for any route under this layout.
 *
 *  - No elf_session at all                    -> redirect to /login
 *  - Logged in, but not a platform admin       -> redirect to /teams
 *  - Platform admin                            -> render the tree
 */
export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = await getAccountSession();
  if (!account) redirect("/login");

  const platformAdmin = await getPlatformAdminSession();
  if (!platformAdmin) redirect("/teams");

  return <>{children}</>;
}
