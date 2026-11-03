import { redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/adminAccess";
import { getReportsData } from "@/lib/platform/reports";
import ReportsDashboard from "./ReportsDashboard";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  if (!(await getAdminAccess())) redirect("/admin");

  const data = await getReportsData();

  return <ReportsDashboard data={data} />;
}
