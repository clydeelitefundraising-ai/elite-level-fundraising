import { cookies }  from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import { getReportsData } from "@/lib/platform/reports";
import ReportsDashboard from "./ReportsDashboard";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const data = await getReportsData();

  return <ReportsDashboard data={data} />;
}
