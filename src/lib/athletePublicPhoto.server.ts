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
import { publicAthletePhotoAllowed } from "@/lib/publicAthletePhotos";

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
 *  page, or null. Same visibility as the page itself (the campaign must
 *  exist, be live and have fundraising on) AND the team's Head Coach must
 *  have turned on Public Athlete Photos, and not hidden this athlete
 *  (Phase T7). Every check fails closed: a missing column (migration not
 *  yet applied), a failed read or anything but an explicit true → null. */
export async function resolvePublicAthletePhoto(slug: string, athleteId: string): Promise<StoragePhoto | null> {
  if (!isAthleteId(athleteId)) return null;

  const settings = await getCampaignSettings(slug);
  if (!settings || settings.archived || settings.fundraising_enabled === false) return null;
  if (!publicAthletePhotoAllowed(settings.public_athlete_photos, false)) return null;

  const athletes = await getRows<{ id: string; campaign_slug: string; profile_photo: string | null; public_photo_excluded: boolean | null }>(
    `athletes?id=eq.${encodeURIComponent(athleteId)}&campaign_slug=eq.${encodeURIComponent(slug)}` +
    `&select=id,campaign_slug,profile_photo,public_photo_excluded&limit=1`,
  );
  const athlete = athletes?.[0];
  if (!athlete || athlete.campaign_slug !== slug) return null;
  if (!publicAthletePhotoAllowed(settings.public_athlete_photos, athlete.public_photo_excluded)) return null;

  const photo = parseOwnStoragePhoto(athlete.profile_photo, BASE);
  if (!photo) return null;
  if (photo.bucket === "athlete-photos") return publishablePhoto(athlete.profile_photo, slug, []);

  const uploader = photo.path.split("/")[0];
  if (!isAthleteId(uploader)) return null;
  const own = await getRows<{ account_id: string }>(
    `team_members?athlete_id=eq.${encodeURIComponent(athleteId)}&account_id=eq.${encodeURIComponent(uploader)}` +
    `&role=eq.athlete&campaign_slug=eq.${encodeURIComponent(slug)}&select=account_id&limit=1`,
  );
  return publishablePhoto(athlete.profile_photo, slug, (own ?? []).map(r => r.account_id));
}

/** Whether a stored athlete photo URL is a source the public page may use:
 *  the coach's roster photo stored under this team, or a profile photo
 *  stored under one of `ownAccountIds` — the accounts linked to this
 *  athlete AS the athlete (never a parent's). Pure; the public route and
 *  the Head Coach's athlete list both use it. */
export function publishablePhoto(url: string | null | undefined, slug: string, ownAccountIds: readonly string[]): StoragePhoto | null {
  const photo = parseOwnStoragePhoto(url, BASE);
  if (!photo) return null;
  if (photo.bucket === "athlete-photos") return photo.path.startsWith(`${slug}/`) ? photo : null;
  return ownAccountIds.includes(photo.path.split("/")[0]) ? photo : null;
}

// ── Season rollover: carried-over exclusions ────────────────────────────
//
// Complete Season copies returning athletes (with their photo and a
// previous_season_athlete_id link) but not public_photo_excluded, and the
// team setting itself restarts OFF. So an athlete whose family objected last
// season must start hidden again the first time the Head Coach turns the
// setting on this season — written BEFORE the setting is turned on (see the
// settings route), so there is never a moment their photo is public.

type ChainRow = { id: string; campaign_slug: string; previous_season_athlete_id: string | null; public_photo_excluded: boolean | null };
const MAX_SEASONS_BACK = 20;

/** Current-season athletes of `slug` that must start hidden because an
 *  earlier season's record of the same athlete was hidden. Walks the
 *  previous_season_athlete_id chain back through seasons that never
 *  configured the setting (no decision was made there); stops at the first
 *  season whose Head Coach did configure it (that season's choice — hidden
 *  or shown — is the latest decision). A link to a record that no longer
 *  exists carries nothing. Returns null if anything can't be read, so the
 *  caller can refuse to turn photos on (fail closed). */
export async function inheritedPhotoExclusions(slug: string): Promise<Set<string> | null> {
  const current = await getRows<ChainRow>(
    `athletes?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,campaign_slug,previous_season_athlete_id,public_photo_excluded`,
  );
  if (!current) return null;
  let pending = new Map<string, string>();
  for (const a of current) {
    if (isAthleteId(a.previous_season_athlete_id)) pending.set(a.id, a.previous_season_athlete_id);
  }
  const inherited = new Set<string>();
  for (let depth = 0; depth < MAX_SEASONS_BACK && pending.size > 0; depth++) {
    const ids = [...new Set(pending.values())];
    const rows = await getRows<ChainRow>(
      `athletes?id=in.(${ids.join(",")})&select=id,campaign_slug,previous_season_athlete_id,public_photo_excluded`,
    );
    if (!rows) return null;
    const slugs = [...new Set(rows.map(r => r.campaign_slug))].filter(s => /^[a-z0-9-]+$/.test(s));
    const camps = slugs.length === 0 ? [] : await getRows<{ campaign_slug: string; public_athlete_photos_changed_at: string | null }>(
      `campaign_settings?campaign_slug=in.(${slugs.join(",")})&select=campaign_slug,public_athlete_photos_changed_at`,
    );
    if (!camps) return null;
    const configured = new Set(camps.filter(c => c.public_athlete_photos_changed_at).map(c => c.campaign_slug));
    const byId = new Map(rows.map(r => [r.id, r]));
    const next = new Map<string, string>();
    for (const [currentId, ancestorId] of pending) {
      const r = byId.get(ancestorId);
      if (!r) continue;                                    // broken link: nothing known to carry
      if (r.public_photo_excluded === true) { inherited.add(currentId); continue; }
      if (configured.has(r.campaign_slug)) continue;       // that season decided "shown"
      if (isAthleteId(r.previous_season_athlete_id)) next.set(currentId, r.previous_season_athlete_id);
    }
    pending = next;
  }
  return inherited;
}

export type PublicPhotoRosterRow = { id: string; name: string; has_photo: boolean; excluded: boolean; inherited?: boolean };

/** The Head Coach's view of the roster for the Public Athlete Photos
 *  setting: whether each athlete has a photo the public page could show,
 *  and whether they are hidden. Null when the roster can't be read. */
export async function getPublicPhotoRoster(slug: string): Promise<PublicPhotoRosterRow[] | null> {
  const [athletes, members, carried] = await Promise.all([
    getRows<{ id: string; name: string; profile_photo: string | null; public_photo_excluded?: boolean | null }>(
      `athletes?campaign_slug=eq.${encodeURIComponent(slug)}&select=*&order=name.asc`,
    ),
    getRows<{ athlete_id: string; account_id: string | null }>(
      `team_members?campaign_slug=eq.${encodeURIComponent(slug)}&role=eq.athlete&athlete_id=not.is.null&select=athlete_id,account_id`,
    ),
    // Display only ("carried over from last season") — never decides access.
    inheritedPhotoExclusions(slug).catch(() => null),
  ]);
  if (!athletes || !members) return null;
  return athletes.map(a => ({
    id: a.id,
    name: a.name,
    has_photo: publishablePhoto(
      a.profile_photo, slug,
      members.filter(m => m.athlete_id === a.id && m.account_id).map(m => m.account_id as string),
    ) !== null,
    excluded: a.public_photo_excluded === true,
    inherited: a.public_photo_excluded === true && (carried?.has(a.id) ?? false),
  }));
}
