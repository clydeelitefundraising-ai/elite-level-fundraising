import CampaignPageClient from "../_shared/CampaignPageClient";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CampaignPageClient slug={slug} />;
}
