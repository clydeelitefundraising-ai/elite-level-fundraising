import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { createAthlete } from "@/lib/platform/athletes";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    name, event, class_year, jersey_number, grad_year,
    profile_photo, goal_cents, contact_phone, contact_email, overrideCollision,
  } = await req.json();
  if (!name?.trim() || !class_year?.trim()) {
    return NextResponse.json({ error: "name and class are required" }, { status: 400 });
  }

  const result = await createAthlete(
    {
      campaignSlug: slug,
      name,
      classYear:    class_year,
      event,
      jerseyNumber: jersey_number ?? null,
      gradYear:     grad_year ?? null,
      profilePhoto: profile_photo ?? null,
      goalCents:    goal_cents ?? null,
      contactPhone: contact_phone ?? null,
      contactEmail: contact_email ?? null,
    },
    { overrideCollision: overrideCollision === true },
  );

  if (!result.ok && result.reason === "validation") {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  if (!result.ok && result.reason === "collision") {
    return NextResponse.json(
      {
        error:     `An athlete named "${result.collision.existing.name}" already exists on this team.`,
        collision: result.collision,
      },
      { status: 409 },
    );
  }
  if (!result.ok) {
    return NextResponse.json({ error: "Failed to add athlete." }, { status: 500 });
  }

  return NextResponse.json(result.athlete);
}
