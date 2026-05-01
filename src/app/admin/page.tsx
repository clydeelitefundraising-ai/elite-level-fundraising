import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { LoginView, AdminDashboard } from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const store = await cookies();
  const token = store.get("elf_admin")?.value;
  if (!verifyToken(token)) return <LoginView />;
  return <AdminDashboard />;
}
