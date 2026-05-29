import { getTeamSponsors } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import SponsorsView from "./SponsorsView";

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
  return <SponsorsView slug={slug} initialSponsors={sponsors} actor={actor} />;
}
