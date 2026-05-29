import { redirect } from "next/navigation";
import { getTeamOrders } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import { coachSession } from "@/lib/permissions";
import OrdersView from "./OrdersView";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const actor    = await getTeamActor(slug);

  if (actor.kind === "public") redirect(`/team/${slug}/login`);
  if (actor.kind !== "coach") redirect(`/team/${slug}/shop`);

  const coach  = coachSession(actor)!;
  const orders = await getTeamOrders(slug);

  // Filter out pending (unpaid) orders
  const paidOrders = orders.filter(o => o.status !== "pending");

  return <OrdersView slug={slug} initialOrders={paidOrders} coachName={coach.name} />;
}
