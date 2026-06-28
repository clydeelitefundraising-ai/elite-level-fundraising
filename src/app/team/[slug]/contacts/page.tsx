import { redirect } from "next/navigation";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { getCampaignSettings } from "@/lib/supabase";
import ContactsView from "./ContactsView";

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [actor, settings] = await Promise.all([
    getTeamActor(slug),
    getCampaignSettings(slug),
  ]);

  if (actor.kind === "public") {
    redirect(`/team/${slug}/login`);
  }
  if (isStaff(actor)) {
    redirect(`/team/${slug}/contacts/coach`);
  }
  if (
    actor.kind !== "member" ||
    (actor.session.role !== "athlete" && actor.session.role !== "parent") ||
    !actor.session.athlete_id
  ) {
    redirect(`/team/${slug}/home`);
  }

  const primaryColor = settings?.primary_color ?? "#0b1e3d";

  return (
    <ContactsView
      slug={slug}
      athleteId={actor.session.athlete_id}
      memberName={actor.session.name}
      memberRole={actor.session.role}
      primaryColor={primaryColor}
    />
  );
}
