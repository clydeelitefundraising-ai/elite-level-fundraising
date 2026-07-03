import { getTeamAthletes } from "@/lib/teamData";
import { requireTeamMembership } from "@/lib/permissions.server";
import TeamView from "./TeamView";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Not a public-facing route — gate it to logged-in members of this team.
  const actor = await requireTeamMembership(slug);
  const athletes = await getTeamAthletes(slug);
  return <TeamView slug={slug} initialAthletes={athletes} actor={actor} />;
}
