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

// ─── Roster-aware search (Group Messaging G3B) ─────────────────────────────
//
// GroupParticipantPicker's athlete search is seeded from the FULL athletes
// roster (GET /messages/group-directory — G3A), not from joined team_members
// rows like searchDirectoryEntries's staff path still is. event/classYear
// are included in the search haystack purely as discoverability metadata —
// per the locked product decision, this never creates or implies an
// event-based group; the coach still picks each athlete individually.
export type RosterAthleteEntry = {
  id:        string; // athletes.id
  name:      string;
  event:     string | null;
  classYear: string | null;
  joined:    boolean;
};

export function searchRosterAthletes(
  entries: RosterAthleteEntry[],
  query: string,
  excludeIds: ReadonlySet<string>,
): RosterAthleteEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: RosterAthleteEntry[] = [];
  for (const entry of entries) {
    if (excludeIds.has(entry.id)) continue;
    const haystack = `${entry.name} ${entry.event ?? ""} ${entry.classYear ?? ""}`.toLowerCase();
    if (!haystack.includes(q)) continue;
    results.push(entry);
    if (results.length >= MAX_GROUP_SEARCH_RESULTS) break;
  }
  return results;
}

// Secondary metadata line (e.g. "Long Jump · JR") — event/classYear joined
// with " · ", skipping whichever is missing/blank; "" (never rendered) if
// neither exists. Deliberately never includes join status — that is always
// a SEPARATE line (see the picker/Manage Group render logic), so a joined
// athlete with no event/class shows no secondary line at all, rather than
// an empty " · " artifact.
export function athleteMetaLabel(event: string | null, classYear: string | null): string {
  return [event, classYear].filter((v): v is string => !!v && v.trim().length > 0).join(" · ");
}

// Neutral, non-alarming copy for an unjoined roster athlete — never shown
// for a joined one, and never implemented as an error/warning string. A
// roster-only athlete not having joined yet is a normal lifecycle state,
// not a problem to flag.
export function athleteJoinStatusLabel(joined: boolean): string | null {
  return joined ? null : "Hasn't joined ELF yet";
}

// Manage Group's secondary line for a directly-assigned roster athlete row
// — mirrors participantSecondaryLabel's "Family member · Included
// automatically" / role-label convention for the other two row kinds
// (family, staff), kept here instead since it's specific to the
// roster-assignment row this module already owns.
export function athleteSecondaryLabel(joined: boolean): string {
  const status = athleteJoinStatusLabel(joined);
  return status ? `Athlete · ${status}` : "Athlete";
}

// ─── Manage Group roster-assignment display (Group Messaging G3B) ─────────
//
// Manage Group must represent GROUP ASSIGNMENT (message_thread_athletes —
// G3A), not merely current message_thread_participants: a roster-only
// (never-joined) athlete has no participant row at all. These two pure
// functions are the single place that reconciles the two data sources, so
// a joined roster athlete is never shown twice (once via their roster
// assignment, once via their own direct participant row) and the visible
// "people" count never double-counts them either.
export type RosterAssignmentWithStatus = {
  athlete_id: string;
  name:       string;
  joined:     boolean;
};

export type ManageGroupParticipantLike = {
  id:                string;
  actor_type:        "coach" | "member" | "platform_admin";
  coach_id:          string | null;
  member_id:         string | null;
  is_auto_included:  boolean;
  name:              string;
  role:              string;
  photo_url:         string | null;
};

export type ManageGroupRow =
  | { kind: "athlete"; key: string; athleteId: string; name: string; joined: boolean }
  | { kind: "family";  key: string; participant: ManageGroupParticipantLike }
  | { kind: "staff";   key: string; participant: ManageGroupParticipantLike };

// Staff first, then every assigned roster athlete (joined or not, each
// appearing exactly once from the roster-assignment list — NEVER also read
// from `participants`, which is where a joined athlete's own direct row
// would otherwise cause a duplicate), then auto-included family. Family and
// staff are the ONLY roles still read from `participants` — a direct,
// non-auto-included "member" row (a joined athlete's own participant
// identity) is deliberately never surfaced here at all.
export function buildManageGroupRows(
  rosterAssignments: RosterAssignmentWithStatus[],
  participants: ManageGroupParticipantLike[],
): ManageGroupRow[] {
  const staff: ManageGroupRow[] = participants
    .filter(p => p.actor_type === "coach")
    .map(p => ({ kind: "staff" as const, key: p.id, participant: p }));
  const athletes: ManageGroupRow[] = rosterAssignments.map(a => ({
    kind: "athlete" as const, key: `athlete-${a.athlete_id}`, athleteId: a.athlete_id, name: a.name, joined: a.joined,
  }));
  const family: ManageGroupRow[] = participants
    .filter(p => p.actor_type === "member" && p.is_auto_included)
    .map(p => ({ kind: "family" as const, key: p.id, participant: p }));
  return [...staff, ...athletes, ...family];
}

// Total distinct people in a group: every assigned roster athlete counts
// once (joined or not — their roster-assignment row IS their one count,
// never added to again), plus active staff, plus active auto-included
// family. Deliberately never cross-references roster assignments against
// participants by id — a joined athlete's own participant row would
// otherwise double-count exactly the person this function exists to count
// correctly once.
export function countGroupPeople(
  rosterAssignments: RosterAssignmentWithStatus[],
  participants: Pick<ManageGroupParticipantLike, "actor_type" | "is_auto_included">[],
): number {
  const staffCount  = participants.filter(p => p.actor_type === "coach").length;
  const familyCount = participants.filter(p => p.actor_type === "member" && p.is_auto_included).length;
  return rosterAssignments.length + staffCount + familyCount;
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
