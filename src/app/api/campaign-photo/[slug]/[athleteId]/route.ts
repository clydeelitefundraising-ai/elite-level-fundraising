import { NextRequest, NextResponse } from "next/server";
import { resolvePublicAthletePhoto } from "@/lib/athletePublicPhoto.server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

type RouteContext = { params: Promise<{ slug: string; athleteId: string }> };

// Never cached (browser or CDN): turning Public Athlete Photos off, hiding
// an athlete or changing a photo takes effect on the very next request —
// a donor's browser can't keep showing a photo that is no longer allowed.
const NO_STORE = "no-store, max-age=0";
const NOT_FOUND = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": NO_STORE } });

// Personalized athlete fundraising page — the athlete's photo for the PUBLIC
// campaign page (/campaign/<slug>?athlete=<id>). Public on purpose (donors
// are anonymous); resolvePublicAthletePhoto decides whether this athlete on
// this live campaign has a photo that may be shown, and only an object in
// ELF's own photo buckets is ever fetched — never a client-supplied URL.
// The image is streamed through, so the storage path (which contains the
// uploader's account id) never reaches the browser. Every refusal is the
// same bare 404, so the route can't be used to probe which ids exist; the
// page then shows the team logo. Shown only when the team's Head Coach has
// turned on Public Athlete Photos and not hidden this athlete (Phase T7).
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug, athleteId } = await params;
  const photo = await resolvePublicAthletePhoto(slug, athleteId);
  if (!photo) return NOT_FOUND();

  const res = await fetch(`${BASE}/storage/v1/object/public/${photo.bucket}/${photo.path}`, { cache: "no-store" }).catch(() => null);
  const type = res?.headers.get("content-type") ?? "";
  if (!res?.ok || !/^image\/(jpeg|png|webp)$/.test(type.split(";")[0].trim())) return NOT_FOUND();

  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": NO_STORE,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
