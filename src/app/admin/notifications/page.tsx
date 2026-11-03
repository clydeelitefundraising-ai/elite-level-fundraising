import { redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/adminAccess";
import { getQueue, getQueueSummary } from "@/lib/platform/notifications";
import NotificationsView from "./NotificationsView";
import type { NotificationsData } from "./types";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  if (!(await getAdminAccess())) redirect("/admin");

  const [queue, summary] = await Promise.all([
    getQueue({ limit: 500 }),
    getQueueSummary(),
  ]);

  const data: NotificationsData = { queue, summary };

  return <NotificationsView data={data} />;
}
