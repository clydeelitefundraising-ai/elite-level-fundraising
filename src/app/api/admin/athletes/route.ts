import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { getAthletes, addAthlete } from "@/lib/supabase";

const SLUG = "paradise-valley-track-field-live";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET() {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const athletes = await getAthletes(SLUG);
  return NextResponse.json(athletes);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name, event } = await req.json();
  if (!name?.trim() || !event?.trim()) {
    return NextResponse.json({ error: "name and event are required" }, { status: 400 });
  }
  const athlete = await addAthlete({ campaign_slug: SLUG, name: name.trim(), event: event.trim() });
  return NextResponse.json(athlete);
}
