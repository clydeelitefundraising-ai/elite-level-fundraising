import { getCampaignSettings } from "@/lib/supabase";
import { getAllTeamProducts } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import { notFound } from "next/navigation";
import ShopView from "./ShopView";

export default async function ShopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [settings, products, actor] = await Promise.all([
    getCampaignSettings(slug),
    getAllTeamProducts(slug),
    getTeamActor(slug),
  ]);

  if (!settings) notFound();

  return <ShopView slug={slug} settings={settings} initialProducts={products} actor={actor} />;
}
