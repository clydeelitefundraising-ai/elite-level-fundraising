import { redirect } from "next/navigation";
import { getAccountSession } from "@/lib/accountSession";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { resolveAuthenticatedLandingPath } from "@/lib/platformAdminLanding";
import LoginView from "./LoginView";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getAccountSession();
  if (session) {
    const platformAdmin = await getPlatformAdminSession();
    redirect(resolveAuthenticatedLandingPath(Boolean(platformAdmin)));
  }
  return <LoginView />;
}
