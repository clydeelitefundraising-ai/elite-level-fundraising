import { notFound } from "next/navigation";
import { isCampaignSlug } from "@/lib/platform/schoolLinksLogic";
import SchoolLinkPanel from "./SchoolLinkPanel";

export const dynamic = "force-dynamic";

// /platform-admin/school-links/[slug] — link, change or unlink the school for
// a team's seasons. The /platform-admin layout already requires a Platform
// Admin account; every API call re-checks it.
export default async function SchoolLinkTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isCampaignSlug(slug)) notFound();
  return <SchoolLinkPanel slug={slug} />;
}
