import { redirect } from "next/navigation";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { getCampaignSettings } from "@/lib/supabase";
import CoachContactsView from "./CoachContactsView";

export default async function CoachContactsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [actor, settings] = await Promise.all([
    getTeamActor(slug),
    getCampaignSettings(slug),
  ]);

  if (actor.kind === "public" || !isStaff(actor)) {
    redirect(`/team/${slug}/home`);
  }

  const isCoach = actor.kind === "coach";
  const primaryColor = settings?.primary_color ?? "#0b1e3d";

  return (
    <CoachContactsView
      slug={slug}
      primaryColor={primaryColor}
      canSetGoals={isCoach}
    />
  );
}
