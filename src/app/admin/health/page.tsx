import { redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/adminAccess";
import { calculateHealth } from "@/lib/platform/health";
import TeamHealthView from "./TeamHealthView";

export const dynamic = "force-dynamic";

export default async function TeamHealthPage() {
  if (!(await getAdminAccess())) redirect("/admin");

  const data = await calculateHealth();

  return <TeamHealthView data={data} />;
}
