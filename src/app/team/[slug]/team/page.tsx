import { getTeamAthletes } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import TeamView from "./TeamView";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [athletes, actor] = await Promise.all([
    getTeamAthletes(slug),
    getTeamActor(slug),
  ]);
  return <TeamView slug={slug} initialAthletes={athletes} actor={actor} />;
}
