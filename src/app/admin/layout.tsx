import { getAdminAccess } from "@/lib/adminAccess";
import { LoginView } from "./AdminClient";
import AdminShell from "./AdminShell";
import "./adminResponsive.css";

export const dynamic = "force-dynamic";

// Legacy /admin tool. A signed-in Platform Admin account is admitted
// directly (no shared password); the shared-password sign-in stays for
// existing users until /admin is retired (src/lib/adminAccess.ts).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAdminAccess();

  if (!access) {
    return <LoginView />;
  }

  return <AdminShell via={access.via}>{children}</AdminShell>;
}
