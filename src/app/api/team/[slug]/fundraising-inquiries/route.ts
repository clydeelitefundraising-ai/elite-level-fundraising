import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { getCampaignSettings } from "@/lib/supabase";
import { getActiveFundraisingInquiry, createFundraisingInquiry } from "@/lib/platform/fundraisingInquiries";

type RouteContext = { params: Promise<{ slug: string }> };

// Phase F1b. Team-scoped endpoint behind the "Inquire About Fundraising"
// empty-state CTA (see src/app/team/[slug]/fundraiser/page.tsx) — NOT the
// future admin inquiry queue (Phase F1d, not built yet). Only this team's
// Head Coach or Assistant Coach may read or create an inquiry here;
// everyone else (booster, parent, athlete, public, platform admin) is
// rejected. The actor's role is always resolved server-side from the
// authenticated session (getTeamActor) — a client-supplied role is never
// trusted, matching every other team-scoped route in this app.
function requireCoach(actor: Awaited<ReturnType<typeof getTeamActor>>) {
  if (actor.kind !== "coach") return null;
  if (actor.session.role !== "head_coach" && actor.session.role !== "assistant_coach") return null;
  return actor.session;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  const coach = requireCoach(actor);
  if (!coach) {
    return NextResponse.json({ error: "Only this team's Head Coach or Assistant Coach can view fundraising inquiries." }, { status: 403 });
  }

  const inquiry = await getActiveFundraisingInquiry(slug);
  return NextResponse.json({ inquiry });
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  const coach = requireCoach(actor);
  if (!coach) {
    return NextResponse.json({ error: "Only this team's Head Coach or Assistant Coach can submit a fundraising inquiry." }, { status: 403 });
  }

  const settings = await getCampaignSettings(slug);
  if (!settings) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }
  if (settings.fundraising_enabled ?? false) {
    return NextResponse.json({ error: "Fundraising is already enabled for this team." }, { status: 409 });
  }

  // No admin-notification email in this phase — see Phase F1b review item 3:
  // there is no existing ELF-admin-notification recipient configured in the
  // Team App's own environment (DEMO_NOTIFICATION_EMAIL is scoped to the
  // separate marketing project's demo-request flow — see
  // docs/MARKETING_ENV_SETUP.md), and inventing a brand-new unconfigured env
  // var to finish this phase was explicitly rejected. The inquiry is fully
  // captured in fundraising_inquiries regardless; an admin notification
  // (plus the eventual admin inquiry queue UI) is deferred to Phase F1d,
  // once a real recipient/configuration decision is made.
  const { inquiry, created } = await createFundraisingInquiry({
    campaignSlug:         slug,
    requestedByAccountId: coach.id,
    requestedByRole:      coach.role as "head_coach" | "assistant_coach",
  });

  return NextResponse.json({ inquiry, created });
}
