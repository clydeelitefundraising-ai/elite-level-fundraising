import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { getCampaignSettings } from "@/lib/supabase";
import { getActiveFundraisingInquiry, createFundraisingInquiry } from "@/lib/platform/fundraisingInquiries";
import { sendFundraisingInquiryNotification } from "@/lib/email";

type RouteContext = { params: Promise<{ slug: string }> };

// Phase F1b. Team-scoped endpoint behind the "Inquire About Fundraising"
// empty-state CTA (see src/app/team/[slug]/fundraiser/page.tsx) — NOT the
// Platform Admin inquiry queue (Phase F1d: see
// src/app/api/platform-admin/fundraising-inquiries/route.ts for that
// read/manage surface). Only this team's Head Coach or Assistant Coach may
// read or create an inquiry here;
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

  const { inquiry, created } = await createFundraisingInquiry({
    campaignSlug:         slug,
    requestedByAccountId: coach.id,
    requestedByRole:      coach.role as "head_coach" | "assistant_coach",
  });

  // Phase F1d: notify ELF operations, but ONLY for an actually-new inquiry
  // — never for a duplicate resolved to the existing active row by
  // createFundraisingInquiry()'s race handling (that's the `created` flag's
  // entire purpose here). A missing recipient or a send failure must never
  // fail the request — the database row above is already the source of
  // truth, and the inquiry has already succeeded by this point.
  if (created) {
    const notifyTo = process.env.ELF_ADMIN_NOTIFICATION_EMAIL;
    if (notifyTo) {
      const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "";
      try {
        await sendFundraisingInquiryNotification({
          to:              notifyTo,
          schoolName:      settings.school_name,
          sportName:       settings.sport_name ?? null,
          requesterName:   coach.name,
          requestedByRole: coach.role as "head_coach" | "assistant_coach",
          campaignSlug:    slug,
          adminUrl:        `${appBase}/platform-admin/fundraising-inquiries`,
        });
      } catch (err) {
        console.error("[fundraising-inquiries] notification email failed:", err);
      }
    } else {
      console.error("[fundraising-inquiries] ELF_ADMIN_NOTIFICATION_EMAIL is not set — skipping notification email");
    }
  }

  return NextResponse.json({ inquiry, created });
}
