import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { redirect } from "next/navigation";
import NewCampaignWizard from "./NewCampaignWizard";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");
  return <NewCampaignWizard />;
}
