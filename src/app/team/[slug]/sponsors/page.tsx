import { getTeamSponsors } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import { isStaff } from "@/lib/permissions";
import SponsorsView from "./SponsorsView";

export default async function SponsorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [allSponsors, actor] = await Promise.all([
    getTeamSponsors(slug),
    getTeamActor(slug),
  ]);
  // Hidden sponsors must never reach a non-staff client — filter here,
  // before this list is serialized into the page/RSC payload, rather than
  // relying on SponsorsView to hide them after the fact in the browser.
  const sponsors = isStaff(actor) ? allSponsors : allSponsors.filter(s => s.visible !== false);
  return <SponsorsView slug={slug} initialSponsors={sponsors} actor={actor} />;
}
