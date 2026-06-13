import { redirect } from "next/navigation";
import { getAccountSession, getAccountTeams } from "@/lib/accountSession";
import TeamsView from "./TeamsView";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const session = await getAccountSession();
  if (!session) redirect("/login");

  const teams = await getAccountTeams(session.id);
  if (teams.length === 1) redirect(`/team/${teams[0].campaign_slug}/home`);

  return <TeamsView teams={teams} accountName={session.name} />;
}
