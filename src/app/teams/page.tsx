import { redirect } from "next/navigation";
import { getAccountSession, getAccountTeams } from "@/lib/accountSession";
import TeamsView from "./TeamsView";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const session = await getAccountSession();
  if (!session) redirect("/login");

  const teams = await getAccountTeams(session.id);

  // Always show the selector, even with exactly one team — keeps the flow
  // consistent and gives users a visible way to add another team (dual-sport
  // athletes, multi-team coaches, parents with kids on different teams).
  return <TeamsView teams={teams} accountName={session.name} />;
}
