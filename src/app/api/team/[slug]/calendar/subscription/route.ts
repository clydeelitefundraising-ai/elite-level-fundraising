import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import {
  getActiveSubscription,
  issueSubscriptionToken,
  revokeSubscriptionToken,
} from "@/lib/calendarSubscription";

// Phase 4C: subscription lifecycle management.
//  - GET:    any authenticated team member (Head Coach, Assistant Coach,
//            Booster, Athlete, Parent) — true self-service. Recomputes
//            and returns the CURRENT active token (if any) to whoever
//            asks; there is no "ask a coach for the link" flow, since the
//            server can always re-derive the token from the active row's
//            id + CALENDAR_SYNC_PEPPER. Never exposes revoked rows, the
//            pepper, or any database internals.
//  - PUT:    staff only. Issues a fresh active token (covers both "enable"
//            and "regenerate" — see issueSubscriptionToken).
//  - DELETE: staff only. Revokes the active token (disable sync).
function feedUrls(origin: string, token: string) {
  const httpsUrl = `${origin}/api/calendar/${token}.ics`;
  return {
    url: httpsUrl,
    webcalUrl: httpsUrl.replace(/^https?:/, "webcal:"),
    googleUrl: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(httpsUrl)}`,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getActiveSubscription(slug);
  if (!status.enabled) return NextResponse.json({ enabled: false });
  return NextResponse.json({
    enabled: true,
    createdAt: status.createdAt,
    ...feedUrls(req.nextUrl.origin, status.token),
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { token, createdAt } = await issueSubscriptionToken(slug);
    return NextResponse.json({ enabled: true, createdAt, ...feedUrls(req.nextUrl.origin, token) });
  } catch {
    // Deliberately generic — never echo the token or DB error detail.
    return NextResponse.json({ error: "Failed to enable calendar sync." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await revokeSubscriptionToken(slug);
  return NextResponse.json({ enabled: false });
}
