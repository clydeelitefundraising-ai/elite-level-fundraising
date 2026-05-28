import { getTeamAthletes } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import RosterView from "./RosterView";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [athletes, actor] = await Promise.all([
    getTeamAthletes(slug),
    getTeamActor(slug),
  ]);
  return <RosterView slug={slug} initialAthletes={athletes} actor={actor} />;
}
