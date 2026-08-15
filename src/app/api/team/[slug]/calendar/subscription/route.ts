import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import {
  getSubscriptionStatus,
  issueSubscriptionToken,
  revokeSubscriptionToken,
} from "@/lib/calendarSubscription";

// Phase 4C: subscription lifecycle management.
//  - GET:    any authenticated team member (status only — never the raw
//            token/hash). Safe for athletes/parents to call so the Export
//            menu never shows a raw error when sync hasn't been set up.
//  - PUT:    staff only. Issues a fresh active token (covers both "create
//            the initial token" and "regenerate" — see issueSubscriptionToken).
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
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = await getSubscriptionStatus(slug);
  return NextResponse.json(status);
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
    return NextResponse.json({ createdAt, ...feedUrls(req.nextUrl.origin, token) });
  } catch {
    // Deliberately generic — never echo the raw token or DB error detail.
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
