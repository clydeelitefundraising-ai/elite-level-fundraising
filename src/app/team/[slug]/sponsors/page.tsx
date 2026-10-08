import { getTeamSponsors } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import PartnersView from "./PartnersView";

// Phase 2.1 — same data fetch as before this phase (no new queries); only
// the rendered component changed, from SponsorsView directly to the new
// PartnersView tab shell, which renders SponsorsView unmodified as its
// "Team Sponsors" tab.
export default async function SponsorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [sponsors, actor] = await Promise.all([
    getTeamSponsors(slug),
    getTeamActor(slug),
  ]);
  return <PartnersView slug={slug} initialSponsors={sponsors} actor={actor} />;
}
