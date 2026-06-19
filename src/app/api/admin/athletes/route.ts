import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { getAthletes, addAthlete } from "@/lib/supabase";

const DEFAULT_SLUG = "paradise-valley-track-field-live";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = req.nextUrl.searchParams.get("slug") ?? DEFAULT_SLUG;
  const athletes = await getAthletes(slug);
  return NextResponse.json(athletes);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { campaign_slug, name, event } = await req.json();
  const slug = campaign_slug ?? DEFAULT_SLUG;
  if (!name?.trim() || !event?.trim()) {
    return NextResponse.json({ error: "name and event are required" }, { status: 400 });
  }
  const athlete = await addAthlete({ campaign_slug: slug, name: name.trim(), event: event.trim(), contact_phone: null, contact_email: null });
  return NextResponse.json(athlete);
}
