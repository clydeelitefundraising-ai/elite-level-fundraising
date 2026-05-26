import { getTeamAthletes } from "@/lib/teamData";
import { getCoachSession } from "@/lib/teamSession";
import RosterView from "./RosterView";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [athletes, coach] = await Promise.all([
    getTeamAthletes(slug),
    getCoachSession(slug),
  ]);
  return <RosterView slug={slug} initialAthletes={athletes} coach={coach} />;
}
