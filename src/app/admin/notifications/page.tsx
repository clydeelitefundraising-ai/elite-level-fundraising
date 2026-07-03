import { cookies }  from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import { getQueue, getQueueSummary } from "@/lib/platform/notifications";
import NotificationsView from "./NotificationsView";
import type { NotificationsData } from "./types";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const [queue, summary] = await Promise.all([
    getQueue({ limit: 500 }),
    getQueueSummary(),
  ]);

  const data: NotificationsData = { queue, summary };

  return <NotificationsView data={data} />;
}
