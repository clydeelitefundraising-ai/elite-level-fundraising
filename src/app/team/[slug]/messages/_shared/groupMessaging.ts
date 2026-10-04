// Group Messaging G2 — pure client-side helpers for the create/manage-group
// UI. Deliberately independent of src/lib/messages.ts's own
// validateGroupName()/GROUP_NAME_MAX_LENGTH: that module is server-only
// (reads SUPABASE_SERVICE_ROLE_KEY and imports node:crypto at module scope)
// and cannot be imported into a "use client" component. This is early,
// client-side validation only — the server's own validateGroupName() (and
// its DB CHECK constraint) remain the authoritative check; keep
// MAX_GROUP_NAME_LENGTH in sync with GROUP_NAME_MAX_LENGTH if that ever
// changes.
export const MAX_GROUP_NAME_LENGTH = 80;

export type GroupNameValidationResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

export function validateGroupNameClient(raw: string): GroupNameValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Group name is required." };
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) {
    return { ok: false, error: `Group name must be ${MAX_GROUP_NAME_LENGTH} characters or fewer.` };
  }
  return { ok: true, name: trimmed };
}

// Search-first participant picker, same lesson Phase C2's athleteSearch.ts
// already proved out for a large roster: an empty query shows nothing (no
// giant always-expanded list), a query returns a small, capped set of
// matches. Written independently here (not imported from
// src/app/enter-code/athleteSearch.ts) since that module's shape
// (SearchableAthlete, with an `event` field) is specific to the C2 picker —
// this is a different directory shape (DirectoryEntry, with a `role`
// field), and the two features shouldn't be coupled just because the
// search behavior rhymes.
export const MAX_GROUP_SEARCH_RESULTS = 8;

export function searchDirectoryEntries<T extends { id: string; name: string }>(
  entries: T[],
  query: string,
  excludeIds: ReadonlySet<string>,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: T[] = [];
  for (const entry of entries) {
    if (excludeIds.has(entry.id)) continue;
    if (!entry.name.toLowerCase().includes(q)) continue;
    results.push(entry);
    if (results.length >= MAX_GROUP_SEARCH_RESULTS) break;
  }
  return results;
}

// ─── Participant identity mapping (G2 review correction) ──────────────────
//
// Makes explicit, and testable, an invariant that was previously only
// IMPLICIT in ManageGroupModal's remove handler: G1's createGroupThread()/
// addGroupParticipants() (src/lib/messages.ts) only ever add a DIRECT
// (is_auto_included=false) "member" participant when it's a validated
// ATHLETE — athleteIds are checked via fetchMemberById(...).role==="athlete"
// before insertion, and parents are NEVER accepted as a direct selection at
// all (the UI never offers them, and the server has no "add this parent
// directly" path). Every is_auto_included=true "member" row is therefore
// ALWAYS a family-mirrored PARENT, and every is_auto_included=false
// "member" row is ALWAYS an ATHLETE. A "coach" actor_type row (any role —
// head_coach, assistant_coach, or booster) always maps to the coach/staff
// identity. This function asserts that mapping at a single point instead of
// leaving it as inline, implicit logic, and deliberately refuses to produce
// a payload for an auto-included row at all — callers must never offer
// removal for one in the first place (G1's own DELETE endpoint rejects it
// with a 400 if attempted anyway).
type RemovableParticipant = {
  actor_type: "coach" | "member" | "platform_admin";
  coach_id: string | null;
  member_id: string | null;
  is_auto_included: boolean;
};

export type RemovalPayload = { athleteId: string } | { staffId: string };

export function removalPayloadForParticipant(p: RemovableParticipant): RemovalPayload | null {
  if (p.is_auto_included) return null;
  if (p.actor_type === "coach" && p.coach_id) return { staffId: p.coach_id };
  if (p.actor_type === "member" && p.member_id) return { athleteId: p.member_id };
  return null;
}

// Mirrors G1's own removeGroupParticipant() last-coach guard exactly
// (src/lib/messages.ts: "A group must have at least one coach.") — used to
// proactively disable the Remove control for the sole remaining coach
// (including the creator, who has no special protection beyond this same
// rule) rather than let a predictable 400 surface after the fact. The
// server check remains authoritative; this is a UX mirror of one simple,
// already-documented rule, not a new policy.
type CoachParticipant = { actor_type: "coach" | "member" | "platform_admin"; coach_id: string | null };

export function isLastActiveCoach(participants: CoachParticipant[], coachId: string): boolean {
  const otherActiveCoaches = participants.filter(p => p.actor_type === "coach" && p.coach_id !== coachId);
  return otherActiveCoaches.length === 0;
}
