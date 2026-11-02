// Links for the staff athlete profile's "Messages" action, and the way
// back to that profile from Messages. Pure (no server imports), so the
// client views can read the same query parameters they were sent.
//
//  • Existing conversation → the thread itself.
//  • None yet → Communications → Messages with the New Message composer
//    open on the Athlete tab and this athlete preselected (the existing
//    composer and its server-side canonical reuse do the rest).
//  • Completed (read-only) season, no conversation → the inbox, where
//    nothing new can be started anyway.
//
// `athlete` carries the roster athlete id (athletes.id) only so the
// back button can return to /team/<slug>/team/<id>; the composer
// resolves the athlete's messaging account itself from the directory.

const ATHLETE_ID = /^[A-Za-z0-9-]{1,64}$/;

export function athleteMessagesHref(params: {
  slug: string;
  athleteId: string;
  existingThreadId: string | null;
  seasonReadOnly: boolean;
}): string {
  const { slug, athleteId, existingThreadId, seasonReadOnly } = params;
  const s = encodeURIComponent(slug);
  const a = encodeURIComponent(athleteId);
  if (existingThreadId) return `/team/${s}/messages/${encodeURIComponent(existingThreadId)}?athlete=${a}`;
  if (seasonReadOnly) return `/team/${s}/communications?tab=messages`;
  return `/team/${s}/communications?tab=messages&compose=athlete&athlete=${a}`;
}

/** The roster athlete id from an `athlete` query parameter, or null when
 *  absent or malformed (never trusted as a path fragment otherwise). */
export function athleteParam(value: string | null | undefined): string | null {
  return value && ATHLETE_ID.test(value) ? value : null;
}

/** The athlete profile to return to, or null to keep the default. */
export function athleteProfilePath(slug: string, athleteId: string | null): string | null {
  return athleteId ? `/team/${encodeURIComponent(slug)}/team/${encodeURIComponent(athleteId)}` : null;
}
