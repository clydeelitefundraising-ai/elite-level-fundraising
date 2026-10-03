import { redirect } from "next/navigation";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { getCampaignSettings } from "@/lib/supabase";
import { validateCoachForCampaign } from "@/lib/platform/coachFundraising";
import { getLinkedAthleteIdsForMember } from "@/lib/familyRelationships";
import { getTeamAthletes } from "@/lib/teamData";
import ContactsView from "./ContactsView";

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ athleteId?: string }>;
}) {
  const { slug } = await params;
  const { athleteId: requestedAthleteId } = await searchParams;
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

  // Family Relationships Phase B follow-up: resolve the full canonical
  // linked-athlete set (legacy column + team_member_athletes), same helper
  // and same selector pattern as the Fundraiser page. A single-child
  // parent (or an athlete, always linked only to themselves) gets exactly
  // one id here and no selector at all — unchanged from before this
  // follow-up. A tampered/unrelated ?athleteId= is silently ignored,
  // falling back to the default (first linked) athlete.
  const linkedAthleteIds = await getLinkedAthleteIdsForMember(actor.session.id, actor.session.athlete_id);
  const selectedAthleteId = requestedAthleteId && linkedAthleteIds.includes(requestedAthleteId)
    ? requestedAthleteId
    : linkedAthleteIds[0];

  const linkedAthletes = linkedAthleteIds.length > 1
    ? await (async () => {
        const athletes = await getTeamAthletes(slug);
        return linkedAthleteIds.map(id => ({ id, name: athletes.find(a => a.id === id)?.name ?? "Unknown" }));
      })()
    : undefined;

  return (
    <ContactsView
      slug={slug}
      memberName={actor.session.name}
      memberRole={actor.session.role}
      primaryColor={primaryColor}
      selectedAthleteId={selectedAthleteId}
      linkedAthletes={linkedAthletes}
    />
  );
}
