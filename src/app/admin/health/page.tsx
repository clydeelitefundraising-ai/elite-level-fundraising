import { cookies }  from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import { getTeamHealthData } from "@/lib/teamHealth";
import TeamHealthView from "./TeamHealthView";

export const dynamic = "force-dynamic";

export default async function TeamHealthPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const data = await getTeamHealthData();

  return <TeamHealthView data={data} />;
}
