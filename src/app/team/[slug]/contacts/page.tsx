import { redirect } from "next/navigation";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { getCampaignSettings } from "@/lib/supabase";
import { validateCoachForCampaign } from "@/lib/platform/coachFundraising";
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

  const primaryColor = settings?.primary_color ?? "#0b1e3d";

  // An active fundraising-participant coach manages their OWN contacts
  // here, via the same ContactsView athletes/parents already use — the
  // GET/POST route (src/app/api/team/[slug]/contacts/route.ts) already
  // scopes to actor.session.id for a coach actor. Any other staff
  // (non-participating coach, booster) keeps the existing campaign-wide
  // read-only report at /contacts/coach.
  if (actor.kind === "coach" && await validateCoachForCampaign(actor.session.id, slug)) {
    return (
      <ContactsView
        slug={slug}
        memberName={actor.session.name}
        memberRole={actor.session.role}
        primaryColor={primaryColor}
      />
    );
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

  return (
    <ContactsView
      slug={slug}
      memberName={actor.session.name}
      memberRole={actor.session.role}
      primaryColor={primaryColor}
    />
  );
}
