import { cookies }  from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import {
  getNeedsAttention, getTodayStats, getPlatformStatus, getPendingItems, getRecentAudit,
} from "@/lib/platform/operations";
import OperationsView from "./OperationsView";
import type { OperationsData } from "./types";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const [{ attention, alertCount }, todayStats, recentEvents] = await Promise.all([
    getNeedsAttention(),
    getTodayStats(),
    getRecentAudit(15),
  ]);

  const data: OperationsData = {
    attention,
    todayStats,
    recentEvents,
    platformStatus: getPlatformStatus(),
    pendingItems:   getPendingItems(),
    alertCount,
    generatedAt: new Date().toISOString(),
  };

  return <OperationsView data={data} />;
}
