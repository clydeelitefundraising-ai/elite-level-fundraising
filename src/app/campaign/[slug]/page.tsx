import CampaignPageClient from "../_shared/CampaignPageClient";

// CampaignPageClient reads the ?athlete= query param via useSearchParams —
// force-dynamic avoids Next.js static-generation trying (and failing) to
// prerender this route without one, matching the pattern used throughout
// this app's other dynamic-data pages.
export const dynamic = "force-dynamic";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CampaignPageClient slug={slug} />;
}
