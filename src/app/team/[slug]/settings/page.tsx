import { redirect } from "next/navigation";
import { getCoachSession } from "@/lib/teamSession";
import { getActiveJoinCode } from "@/lib/teamData";
import SettingsView from "./SettingsView";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) redirect(`/team/${slug}/login`);

  const activeCode = await getActiveJoinCode(slug);

  return <SettingsView slug={slug} coach={coach} initialCode={activeCode} />;
}
