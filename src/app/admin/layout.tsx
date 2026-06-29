import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { LoginView } from "./AdminClient";
import AdminShell from "./AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const token = store.get("elf_admin")?.value;

  if (!verifyToken(token)) {
    return <LoginView />;
  }

  return <AdminShell>{children}</AdminShell>;
}
