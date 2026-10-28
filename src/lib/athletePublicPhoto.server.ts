// Which stored photo (if any) the PUBLIC campaign page may show for an
// athlete. Server-only: reads with the service role and returns a storage
// object to stream, never a URL for the browser — the public page loads the
// image from /api/campaign-photo/<slug>/<athleteId> instead, so neither the
// bucket path nor the uploader's account id ever reaches a donor.
//
// Accepted sources (anything else → no photo → the page shows the team logo):
//   - athlete-photos/<slug>/…   the coach's roster photo for this athlete
//                                (api/team/[slug]/roster/photo, staff-only)
//   - profile-photos/<accountId>/… the athlete's OWN account photo — the
//                                accountId must be linked to this athlete
//                                as role "athlete". Before this phase a
//                                parent's account photo could be copied onto
//                                the child's athlete row (see
//                                api/account/profile/photo); those are
//                                refused here rather than shown publicly as
//                                the athlete.
import { getCampaignSettings } from "@/lib/supabase";
import { isAthleteId } from "@/lib/athleteSpotlight";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export type StoragePhoto = { bucket: "profile-photos" | "athlete-photos"; path: string };

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/** A photo URL that points into one of ELF's own public photo buckets on
 *  this project, as { bucket, path } — or null for anything else (another
 *  host, another bucket, query strings, traversal). */
export function parseOwnStoragePhoto(url: string | null | undefined, supabaseUrl: string): StoragePhoto | null {
  if (!url || !supabaseUrl) return null;
  for (const bucket of ["profile-photos", "athlete-photos"] as const) {
    const prefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/`;
    if (!url.startsWith(prefix)) continue;
    const path = url.slice(prefix.length);
    const segments = path.split("/");
    if (segments.length !== 2 || !segments.every(s => SAFE_SEGMENT.test(s) && s !== "." && s !== "..")) return null;
    return { bucket, path };
  }
  return null;
}

function headers() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function getRows<T>(query: string): Promise<T[] | null> {
  const res = await fetch(`${BASE}/rest/v1/${query}`, { headers: headers(), cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) ? rows as T[] : null;
}

/** The storage object to serve for this athlete on this campaign's public
 *  page, or null. Same visibility as the page itself: the campaign must
 *  exist, be live (not archived) and have fundraising on. */
export async function resolvePublicAthletePhoto(slug: string, athleteId: string): Promise<StoragePhoto | null> {
  if (!isAthleteId(athleteId)) return null;

  const settings = await getCampaignSettings(slug);
  if (!settings || settings.archived || settings.fundraising_enabled === false) return null;

  const athletes = await getRows<{ id: string; campaign_slug: string; profile_photo: string | null }>(
    `athletes?id=eq.${encodeURIComponent(athleteId)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id,campaign_slug,profile_photo&limit=1`,
  );
  const athlete = athletes?.[0];
  if (!athlete || athlete.campaign_slug !== slug) return null;

  const photo = parseOwnStoragePhoto(athlete.profile_photo, BASE);
  if (!photo) return null;

  if (photo.bucket === "athlete-photos") {
    // Roster uploads are stored under the team's own slug.
    return photo.path.startsWith(`${slug}/`) ? photo : null;
  }

  const uploader = photo.path.split("/")[0];
  if (!isAthleteId(uploader)) return null;
  const own = await getRows<{ id: string }>(
    `team_members?athlete_id=eq.${encodeURIComponent(athleteId)}&account_id=eq.${encodeURIComponent(uploader)}` +
    `&role=eq.athlete&campaign_slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`,
  );
  return own && own.length > 0 ? photo : null;
}
