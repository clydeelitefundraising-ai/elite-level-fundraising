const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type ActorKey =
  | { kind: "coach";  id: string }
  | { kind: "member"; id: string };

export type ResolvedParticipant = {
  id: string;
  actor_type: "coach" | "member";
  coach_id: string | null;
  member_id: string | null;
  is_auto_included: boolean;
  is_observer: boolean;
  name: string;
  role: string;
  athlete_id: string | null;
  photo_url: string | null;
};

export type ResolvedMessage = {
  id: string;
  thread_id: string;
  sender_type: "coach" | "member";
  sender_coach_id: string | null;
  sender_member_id: string | null;
  body: string;
  created_at: string;
  sender_name: string;
  sender_role: string;
  sender_photo_url: string | null;
  read_at: string | null;
};

export type MessageThread = {
  id: string;
  campaign_slug: string;
  subject: string | null;
  created_by_type: "coach" | "member";
  created_by_coach_id: string | null;
  created_by_member_id: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  created_at: string;
};

export type ThreadWithDetails = MessageThread & {
  participants: ResolvedParticipant[];
  unread_count: number;
};

export type ParticipantInsert = {
  thread_id: string;
  actor_type: "coach" | "member";
  coach_id: string | null;
  member_id: string | null;
  is_auto_included: boolean;
  is_observer: boolean;
};

export type ParticipantRef = {
  actor_type: "coach" | "member";
  coach_id: string | null;
  member_id: string | null;
};

// ─── Internal raw types ───────────────────────────────────────────────────────

// Photo resolution rule (canonical, single source of truth — see
// resolvePhotoUrl below): athletes use athletes.profile_photo (kept in
// sync with the account's own photo upload via
// /api/account/profile/photo's propagateToAthletes — so this is already
// the effectively-canonical value for an athlete, not a secondary
// fallback). Every other actor type (coach, parent, booster) has no photo
// field of its own — team_coaches/team_members carry none — so they
// resolve via their linked elf_accounts.profile_photo_url. Both are
// fetched via the SAME existing embedded PostgREST select already used
// for participant name/role — zero additional queries (see PARTICIPANT_
// SELECT/MESSAGE_SELECT below).
export type RawCoachInfo   = { name: string; role: string; elf_accounts: { profile_photo_url: string | null } | null };
export type RawMemberInfo  = {
  name: string; role: string; athlete_id: string | null;
  athletes: { profile_photo: string | null } | null;
  elf_accounts: { profile_photo_url: string | null } | null;
};

export function resolvePhotoUrl(coach: RawCoachInfo | null, member: RawMemberInfo | null): string | null {
  if (member?.role === "athlete" && member.athletes?.profile_photo) return member.athletes.profile_photo;
  return coach?.elf_accounts?.profile_photo_url ?? member?.elf_accounts?.profile_photo_url ?? null;
}

type RawParticipant = {
  id: string;
  thread_id: string;
  actor_type: string;
  coach_id: string | null;
  member_id: string | null;
  is_auto_included: boolean;
  is_observer: boolean;
  team_coaches: RawCoachInfo | null;
  team_members: RawMemberInfo | null;
};

type RawMessage = {
  id: string;
  thread_id: string;
  sender_type: string;
  sender_coach_id: string | null;
  sender_member_id: string | null;
  body: string;
  created_at: string;
  team_coaches: RawCoachInfo | null;
  team_members: RawMemberInfo | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveParticipant(raw: RawParticipant): ResolvedParticipant {
  return {
    id: raw.id,
    actor_type: raw.actor_type as "coach" | "member",
    coach_id: raw.coach_id,
    member_id: raw.member_id,
    is_auto_included: raw.is_auto_included,
    is_observer: raw.is_observer,
    name: raw.team_coaches?.name ?? raw.team_members?.name ?? "Unknown",
    role: raw.team_coaches?.role ?? raw.team_members?.role ?? "",
    athlete_id: raw.team_members?.athlete_id ?? null,
    photo_url: resolvePhotoUrl(raw.team_coaches, raw.team_members),
  };
}

const COACH_INFO_SELECT  = "name,role,elf_accounts!account_id(profile_photo_url)";
const MEMBER_INFO_SELECT = "name,role,athlete_id,athletes!athlete_id(profile_photo),elf_accounts!account_id(profile_photo_url)";

const PARTICIPANT_SELECT =
  "id,thread_id,actor_type,coach_id,member_id,is_auto_included,is_observer," +
  `team_coaches!coach_id(${COACH_INFO_SELECT}),team_members!member_id(${MEMBER_INFO_SELECT})`;

// ─── Thread list ──────────────────────────────────────────────────────────────

export async function getThreadsForActor(
  slug: string,
  actor: ActorKey,
): Promise<ThreadWithDetails[]> {
  const fk = actor.kind === "coach" ? "coach_id" : "member_id";

  const ptRes = await fetch(
    `${BASE}/rest/v1/message_thread_participants` +
    `?actor_type=eq.${actor.kind}&${fk}=eq.${encodeURIComponent(actor.id)}&select=thread_id`,
    { headers: h(), cache: "no-store" },
  );
  if (!ptRes.ok) return [];
  const ptRows: { thread_id: string }[] = await ptRes.json();
  if (!ptRows.length) return [];

  const inClause = `(${ptRows.map(r => r.thread_id).join(",")})`;

  const [threadRes, participantsRes, msgRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/message_threads?id=in.${inClause}&order=last_message_at.desc&limit=50`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/message_thread_participants?thread_id=in.${inClause}&select=${PARTICIPANT_SELECT}`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/messages?thread_id=in.${inClause}&select=id,thread_id,sender_coach_id,sender_member_id`,
      { headers: h(), cache: "no-store" },
    ),
  ]);

  const threads: MessageThread[] = threadRes.ok ? await threadRes.json() : [];
  if (!threads.length) return [];

  const rawPt: RawParticipant[] = participantsRes.ok ? await participantsRes.json() : [];
  const participantsByThread = new Map<string, ResolvedParticipant[]>();
  for (const raw of rawPt) {
    const list = participantsByThread.get(raw.thread_id) ?? [];
    list.push(resolveParticipant(raw));
    participantsByThread.set(raw.thread_id, list);
  }

  type MsgStub = { id: string; thread_id: string; sender_coach_id: string | null; sender_member_id: string | null };
  const msgs: MsgStub[] = msgRes.ok ? await msgRes.json() : [];

  const othersMessages = msgs.filter(m =>
    actor.kind === "coach" ? m.sender_coach_id !== actor.id : m.sender_member_id !== actor.id,
  );

  let readSet = new Set<string>();
  if (othersMessages.length) {
    const msgIds = othersMessages.map(m => m.id).join(",");
    const readsRes = await fetch(
      `${BASE}/rest/v1/message_reads?actor_type=eq.${actor.kind}&${fk}=eq.${encodeURIComponent(actor.id)}` +
      `&message_id=in.(${msgIds})&select=message_id`,
      { headers: h(), cache: "no-store" },
    );
    const reads: { message_id: string }[] = readsRes.ok ? await readsRes.json() : [];
    readSet = new Set(reads.map(r => r.message_id));
  }

  const unreadByThread = new Map<string, number>();
  for (const m of othersMessages) {
    if (!readSet.has(m.id)) {
      unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) ?? 0) + 1);
    }
  }

  return threads.map(t => ({
    ...t,
    participants: participantsByThread.get(t.id) ?? [],
    unread_count: unreadByThread.get(t.id) ?? 0,
  }));
}

// ─── Thread detail ────────────────────────────────────────────────────────────

export async function getThreadById(
  threadId: string,
  slug: string,
): Promise<MessageThread | null> {
  const res = await fetch(
    `${BASE}/rest/v1/message_threads` +
    `?id=eq.${encodeURIComponent(threadId)}&campaign_slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: MessageThread[] = await res.json();
  return rows[0] ?? null;
}

export async function getThreadParticipants(
  threadId: string,
): Promise<ResolvedParticipant[]> {
  const res = await fetch(
    `${BASE}/rest/v1/message_thread_participants` +
    `?thread_id=eq.${encodeURIComponent(threadId)}&select=${PARTICIPANT_SELECT}`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  const rows: RawParticipant[] = await res.json();
  return rows.map(resolveParticipant);
}

export async function isParticipant(
  threadId: string,
  actor: ActorKey,
): Promise<boolean> {
  const fk = actor.kind === "coach" ? "coach_id" : "member_id";
  const res = await fetch(
    `${BASE}/rest/v1/message_thread_participants` +
    `?thread_id=eq.${encodeURIComponent(threadId)}` +
    `&actor_type=eq.${actor.kind}&${fk}=eq.${encodeURIComponent(actor.id)}` +
    `&select=id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return false;
  const rows: { id: string }[] = await res.json();
  return rows.length > 0;
}

export async function getMessagesForThread(
  threadId: string,
  actor: ActorKey,
  limit = 50,
): Promise<ResolvedMessage[]> {
  const res = await fetch(
    `${BASE}/rest/v1/messages?thread_id=eq.${encodeURIComponent(threadId)}` +
    `&order=created_at.asc&limit=${limit}` +
    `&select=id,thread_id,sender_type,sender_coach_id,sender_member_id,body,created_at,` +
    `team_coaches!sender_coach_id(${COACH_INFO_SELECT}),team_members!sender_member_id(${MEMBER_INFO_SELECT})`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  const rows: RawMessage[] = await res.json();
  if (!rows.length) return [];

  const fk = actor.kind === "coach" ? "coach_id" : "member_id";
  const msgIds = rows.map(r => r.id).join(",");
  const readsRes = await fetch(
    `${BASE}/rest/v1/message_reads?actor_type=eq.${actor.kind}&${fk}=eq.${encodeURIComponent(actor.id)}` +
    `&message_id=in.(${msgIds})&select=message_id,read_at`,
    { headers: h(), cache: "no-store" },
  );
  const reads: { message_id: string; read_at: string }[] = readsRes.ok
    ? await readsRes.json()
    : [];
  const readMap = new Map(reads.map(r => [r.message_id, r.read_at]));

  return rows.map(r => ({
    id: r.id,
    thread_id: r.thread_id,
    sender_type: r.sender_type as "coach" | "member",
    sender_coach_id: r.sender_coach_id,
    sender_member_id: r.sender_member_id,
    body: r.body,
    created_at: r.created_at,
    sender_name: r.team_coaches?.name ?? r.team_members?.name ?? "Unknown",
    sender_role: r.team_coaches?.role ?? r.team_members?.role ?? "",
    sender_photo_url: resolvePhotoUrl(r.team_coaches, r.team_members),
    read_at: readMap.get(r.id) ?? null,
  }));
}

// ─── Unread count (for nav badge) ─────────────────────────────────────────────

export async function getUnreadMessageCount(
  actor: ActorKey,
): Promise<number> {
  const fk = actor.kind === "coach" ? "coach_id" : "member_id";

  const ptRes = await fetch(
    `${BASE}/rest/v1/message_thread_participants` +
    `?actor_type=eq.${actor.kind}&${fk}=eq.${encodeURIComponent(actor.id)}&select=thread_id`,
    { headers: h(), cache: "no-store" },
  );
  if (!ptRes.ok) return 0;
  const ptRows: { thread_id: string }[] = await ptRes.json();
  if (!ptRows.length) return 0;

  const inClause = `(${ptRows.map(r => r.thread_id).join(",")})`;
  const msgRes = await fetch(
    `${BASE}/rest/v1/messages?thread_id=in.${inClause}&select=id,sender_coach_id,sender_member_id`,
    { headers: h(), cache: "no-store" },
  );
  if (!msgRes.ok) return 0;
  const msgs: { id: string; sender_coach_id: string | null; sender_member_id: string | null }[] =
    await msgRes.json();

  const others = msgs.filter(m =>
    actor.kind === "coach" ? m.sender_coach_id !== actor.id : m.sender_member_id !== actor.id,
  );
  if (!others.length) return 0;

  const readsRes = await fetch(
    `${BASE}/rest/v1/message_reads?actor_type=eq.${actor.kind}&${fk}=eq.${encodeURIComponent(actor.id)}` +
    `&message_id=in.(${others.map(m => m.id).join(",")})&select=message_id`,
    { headers: h(), cache: "no-store" },
  );
  const reads: { message_id: string }[] = readsRes.ok ? await readsRes.json() : [];
  const readSet = new Set(reads.map(r => r.message_id));

  return others.filter(m => !readSet.has(m.id)).length;
}

// ─── Write helpers ────────────────────────────────────────────────────────────

// Thrown by the write helpers below on a failed insert — callers decide
// whether that's fatal (thread creation, reply-time sync) or best-effort
// (the parent-linking hooks already wrap their sync call in try/catch).
// Message never exposes raw Postgres/PostgREST details.
export class ParticipantSyncError extends Error {
  constructor(context: string) {
    super(`Failed to synchronize thread participants (${context}).`);
    this.name = "ParticipantSyncError";
  }
}

export async function insertParticipants(
  rows: ParticipantInsert[],
): Promise<void> {
  if (!rows.length) return;
  const res = await fetch(`${BASE}/rest/v1/message_thread_participants`, {
    method:  "POST",
    headers: h({ Prefer: "return=minimal" }),
    body:    JSON.stringify(rows),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("[messages] insertParticipants failed:", res.status, detail);
    throw new ParticipantSyncError("insert");
  }
}

// Same insert, but tolerant of a row that already exists — used by
// syncRequiredThreadParticipants(), which may race against a concurrent
// sync call (e.g. two replies landing close together). Targets
// (thread_id, participant_key) — a GENERATED, NON-partial-indexed column
// (phase_2a_message_thread_participants_conflict_fix migration).
// mtp_member_uniq/mtp_coach_uniq are partial indexes (WHERE ... IS NOT
// NULL) and cannot be used as a PostgREST on_conflict target at all —
// using them silently fails every insert at the database level (this is
// the exact issue phase28b already fixed for message_reads via its own
// participant_key column; this table needed the same fix).
async function insertParticipantsIgnoringDuplicates(
  rows: ParticipantInsert[],
): Promise<void> {
  if (!rows.length) return;
  const res = await fetch(`${BASE}/rest/v1/message_thread_participants?on_conflict=thread_id,participant_key`, {
    method:  "POST",
    headers: h({ Prefer: "resolution=ignore-duplicates,return=minimal" }),
    body:    JSON.stringify(rows),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("[messages] insertParticipantsIgnoringDuplicates failed:", res.status, detail);
    throw new ParticipantSyncError("sync");
  }
}

// ─── Canonical family participant sync ───────────────────────────────────────
//
// Given a set of member ids already (or about to be) in a thread, resolves
// the COMPLETE required family group from canonical team_members/athlete_id
// relationships only — never inferred from name/email/display data. For
// each seed member that is an athlete or a parent, this returns every
// team_members row sharing that athlete_id (the athlete row + every
// currently-linked parent row), so it works identically regardless of
// whether the athlete or a parent is the one already in the thread. Always
// re-derives athlete_id from a fresh, campaign-scoped read — never trusts
// a caller-supplied athlete_id or campaign.
export async function resolveRequiredFamilyParticipants(
  memberIds: string[],
  campaignSlug: string,
): Promise<ParticipantRef[]> {
  if (!memberIds.length) return [];

  const seedRes = await fetch(
    `${BASE}/rest/v1/team_members` +
    `?id=in.(${memberIds.map(encodeURIComponent).join(",")})` +
    `&campaign_slug=eq.${encodeURIComponent(campaignSlug)}` +
    `&select=id,role,athlete_id`,
    { headers: h(), cache: "no-store" },
  );
  const seeds: { id: string; role: string; athlete_id: string | null }[] =
    seedRes.ok ? await seedRes.json() : [];

  const athleteIds = new Set<string>();
  for (const seed of seeds) {
    if ((seed.role === "athlete" || seed.role === "parent") && seed.athlete_id) {
      athleteIds.add(seed.athlete_id);
    }
  }
  if (!athleteIds.size) return [];

  const familyRes = await fetch(
    `${BASE}/rest/v1/team_members` +
    `?athlete_id=in.(${[...athleteIds].map(encodeURIComponent).join(",")})` +
    `&campaign_slug=eq.${encodeURIComponent(campaignSlug)}` +
    `&role=in.(athlete,parent)` +
    `&select=id`,
    { headers: h(), cache: "no-store" },
  );
  const family: { id: string }[] = familyRes.ok ? await familyRes.json() : [];

  return family.map(m => ({ actor_type: "member" as const, coach_id: null, member_id: m.id }));
}

// Ensures a thread's canonical family requirements are met — called at
// thread creation and before every reply, so a parent linked after the
// thread already exists gets added the next time the thread is used
// (self-healing), rather than requiring a backfill. ADDITIVE ONLY: never
// removes a participant, even one whose relationship has since changed —
// that policy is deliberately out of scope for this function. Does not
// touch Head Coach oversight (is_observer) participants at all — this only
// ever adds member/family rows.
export async function syncRequiredThreadParticipants(
  threadId: string,
  campaignSlug: string,
): Promise<void> {
  const current = await getThreadParticipants(threadId);
  const currentMemberIds = current
    .filter(p => p.actor_type === "member" && p.member_id)
    .map(p => p.member_id as string);
  if (!currentMemberIds.length) return;

  const required = await resolveRequiredFamilyParticipants(currentMemberIds, campaignSlug);
  if (!required.length) return;

  const currentSet = new Set(currentMemberIds);
  const missing = required.filter(r => r.member_id && !currentSet.has(r.member_id));
  if (!missing.length) return;

  await insertParticipantsIgnoringDuplicates(
    missing.map(m => ({
      thread_id:        threadId,
      actor_type:       "member" as const,
      coach_id:         null,
      member_id:        m.member_id,
      is_auto_included: true,
      is_observer:       false,
    })),
  );
}

// Called when a parent becomes newly linked to an athlete (from the
// canonical linking call sites — members/me self-link, and the parent
// branches of the join endpoints — never from a client-facing "add
// participant" API). Finds every EXISTING same-campaign thread that
// already includes this athlete AND at least one coach, and synchronizes
// each via the same syncRequiredThreadParticipants() used at thread
// creation/reply — no family-resolution logic is duplicated here, this
// only discovers which threads need a sync pass. Additive only, same as
// the function it delegates to: never removes anyone, never touches
// coach/observer rows, idempotent (a parent already present in a thread
// is simply skipped by the underlying sync).
export async function syncParentIntoAthleteThreads(
  athleteId: string,
  campaignSlug: string,
): Promise<void> {
  const athleteMemberRes = await fetch(
    `${BASE}/rest/v1/team_members` +
    `?athlete_id=eq.${encodeURIComponent(athleteId)}` +
    `&role=eq.athlete` +
    `&campaign_slug=eq.${encodeURIComponent(campaignSlug)}` +
    `&select=id`,
    { headers: h(), cache: "no-store" },
  );
  const athleteMembers: { id: string }[] = athleteMemberRes.ok ? await athleteMemberRes.json() : [];
  if (!athleteMembers.length) return;

  const memberIds = athleteMembers.map(m => m.id);
  const ptRes = await fetch(
    `${BASE}/rest/v1/message_thread_participants` +
    `?actor_type=eq.member&member_id=in.(${memberIds.map(encodeURIComponent).join(",")})` +
    `&select=thread_id`,
    { headers: h(), cache: "no-store" },
  );
  const ptRows: { thread_id: string }[] = ptRes.ok ? await ptRes.json() : [];
  if (!ptRows.length) return;

  const threadIds = [...new Set(ptRows.map(r => r.thread_id))];
  const inClause = `(${threadIds.map(encodeURIComponent).join(",")})`;

  // Restrict to: same campaign, AND has at least one coach participant.
  const [threadsRes, coachPartsRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/message_threads?id=in.${inClause}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=id`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/message_thread_participants?thread_id=in.${inClause}&actor_type=eq.coach&select=thread_id`,
      { headers: h(), cache: "no-store" },
    ),
  ]);
  const sameCampaignIds = new Set<string>(
    (threadsRes.ok ? await threadsRes.json() : []).map((t: { id: string }) => t.id),
  );
  const coachThreadIds = new Set<string>(
    (coachPartsRes.ok ? await coachPartsRes.json() : []).map((p: { thread_id: string }) => p.thread_id),
  );

  const targets = threadIds.filter(id => sameCampaignIds.has(id) && coachThreadIds.has(id));
  for (const threadId of targets) {
    await syncRequiredThreadParticipants(threadId, campaignSlug);
  }
}

// ─── Canonical conversation identity + reuse (Phase 2B) ──────────────────────
//
// Two "+ New" attempts at the same NON-OBSERVER participant/family group
// should land in the same ongoing conversation, matching iMessage-style
// texting rather than always creating a new thread. Identity is defined
// ONLY by the set of non-observer participants — Head Coach oversight
// (is_observer=true) never contributes to identity, matching the explicit
// product rule that observers must not define conversation identity.
// Auto-included family members are treated identically to explicitly-
// added ones: resolveRequiredFamilyParticipants() already fully resolves
// the family group before this key is computed, so two attempts at "the
// same conversation" — regardless of who initiated, or whether a parent
// was linked before or after — always converge on the same key.
function canonicalParticipantKey(participants: ParticipantRef[]): string {
  return participants
    .map(p => `${p.actor_type}:${p.actor_type === "coach" ? p.coach_id : p.member_id}`)
    .sort()
    .join("|");
}

// Finds an existing thread whose CURRENT non-observer participant set
// EXACTLY matches the desired canonical set — never a superset or subset
// (partial participant overlap never counts as a match, per the product
// rule). Scoped to threads the acting user already participates in
// (bounded by the actor's own thread count, same bound already accepted
// by getThreadsForActor — not a campaign-wide scan) and restricted to this
// campaign via campaign_slug=eq.<slug>.
//
// DETERMINISTIC SELECTION RULE when multiple historical threads match
// (duplicates that existed before this feature shipped): the thread with
// the most recent last_message_at is chosen — threads are fetched
// order=last_message_at.desc, so the first exact match found is that
// thread. No historical thread is modified, merged, or deleted by this
// function — it only reads and selects; if no exact match exists it
// returns null and the caller creates a new thread exactly as before.
export async function findCanonicalExistingThread(
  slug: string,
  actor: ActorKey,
  desiredNonObserverParticipants: ParticipantRef[],
): Promise<MessageThread | null> {
  const desiredKey = canonicalParticipantKey(desiredNonObserverParticipants);
  if (!desiredKey) return null;

  const fk = actor.kind === "coach" ? "coach_id" : "member_id";
  const ptRes = await fetch(
    `${BASE}/rest/v1/message_thread_participants` +
    `?actor_type=eq.${actor.kind}&${fk}=eq.${encodeURIComponent(actor.id)}&select=thread_id`,
    { headers: h(), cache: "no-store" },
  );
  if (!ptRes.ok) return null;
  const ptRows: { thread_id: string }[] = await ptRes.json();
  if (!ptRows.length) return null;

  const threadIds = ptRows.map(r => r.thread_id);
  const inClause = `(${threadIds.map(encodeURIComponent).join(",")})`;

  const [threadsRes, partsRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/message_threads?id=in.${inClause}` +
      `&campaign_slug=eq.${encodeURIComponent(slug)}` +
      `&select=id,campaign_slug,subject,created_by_type,created_by_coach_id,created_by_member_id,last_message_at,last_message_preview,created_at` +
      `&order=last_message_at.desc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/message_thread_participants?thread_id=in.${inClause}&select=thread_id,actor_type,coach_id,member_id,is_observer`,
      { headers: h(), cache: "no-store" },
    ),
  ]);
  const threads: MessageThread[] = threadsRes.ok ? await threadsRes.json() : [];
  if (!threads.length) return null;

  type PartStub = { thread_id: string; actor_type: string; coach_id: string | null; member_id: string | null; is_observer: boolean };
  const allParts: PartStub[] = partsRes.ok ? await partsRes.json() : [];

  const partsByThread = new Map<string, PartStub[]>();
  for (const p of allParts) {
    const list = partsByThread.get(p.thread_id) ?? [];
    list.push(p);
    partsByThread.set(p.thread_id, list);
  }

  for (const t of threads) {
    const parts = partsByThread.get(t.id) ?? [];
    const nonObserver: ParticipantRef[] = parts
      .filter(p => !p.is_observer)
      .map(p => ({ actor_type: p.actor_type as "coach" | "member", coach_id: p.coach_id, member_id: p.member_id }));
    if (canonicalParticipantKey(nonObserver) === desiredKey) {
      return t;
    }
  }
  return null;
}

// Tops up Head Coach oversight participants on an EXISTING thread when
// it's reused instead of newly created, so reuse never leaves a
// conversation with weaker oversight than a brand-new thread would have
// gotten. Same additive/idempotent guarantee as syncRequiredThreadParticipants
// (uses the same safe insert) — never removes anyone, never touches an
// existing row's is_observer flag, only adds missing oversight rows.
export async function ensureHeadCoachOversight(
  threadId: string,
  headCoachIds: string[],
): Promise<void> {
  if (!headCoachIds.length) return;
  const current = await getThreadParticipants(threadId);
  const currentCoachIds = new Set(current.filter(p => p.actor_type === "coach").map(p => p.coach_id));
  const missing = headCoachIds.filter(id => !currentCoachIds.has(id));
  if (!missing.length) return;

  await insertParticipantsIgnoringDuplicates(
    missing.map(id => ({
      thread_id:        threadId,
      actor_type:       "coach" as const,
      coach_id:         id,
      member_id:        null,
      is_auto_included: true,
      is_observer:       true,
    })),
  );
}

export async function insertMessage(
  threadId: string,
  actor: ActorKey,
  body: string,
): Promise<{ id: string; created_at: string } | null> {
  const res = await fetch(`${BASE}/rest/v1/messages`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify({
      thread_id:        threadId,
      sender_type:      actor.kind,
      sender_coach_id:  actor.kind === "coach"  ? actor.id : null,
      sender_member_id: actor.kind === "member" ? actor.id : null,
      body,
    }),
  });
  if (!res.ok) return null;
  const rows: { id: string; created_at: string }[] = await res.json();
  return rows[0] ?? null;
}

export async function updateThreadMeta(
  threadId: string,
  preview: string,
): Promise<void> {
  await fetch(`${BASE}/rest/v1/message_threads?id=eq.${encodeURIComponent(threadId)}`, {
    method:  "PATCH",
    headers: h({ Prefer: "return=minimal" }),
    body:    JSON.stringify({
      last_message_at:      new Date().toISOString(),
      last_message_preview: preview.slice(0, 80),
    }),
  });
}

export async function markMessagesReadForActor(
  messageIds: string[],
  actor: ActorKey,
): Promise<void> {
  if (!messageIds.length) return;
  const now = new Date().toISOString();
  // participant_key is a GENERATED column: actor_type || ':' || coalesce(coach_id, member_id)
  // Using it as the on_conflict target lets PostgREST emit ON CONFLICT DO NOTHING on the
  // non-partial (message_id, participant_key) unique index (phase28b migration).
  await fetch(
    `${BASE}/rest/v1/message_reads?on_conflict=message_id,participant_key`,
    {
      method:  "POST",
      headers: h({ Prefer: "resolution=ignore-duplicates,return=minimal" }),
      body:    JSON.stringify(
        messageIds.map(id => ({
          message_id: id,
          actor_type: actor.kind,
          coach_id:   actor.kind === "coach"  ? actor.id : null,
          member_id:  actor.kind === "member" ? actor.id : null,
          read_at:    now,
        })),
      ),
    },
  );
}

// ─── Safety helpers ───────────────────────────────────────────────────────────

export async function fetchMemberById(
  memberId: string,
  slug: string,
): Promise<{ id: string; name: string; role: string; athlete_id: string | null } | null> {
  const res = await fetch(
    `${BASE}/rest/v1/team_members` +
    `?id=eq.${encodeURIComponent(memberId)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,role,athlete_id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: { id: string; name: string; role: string; athlete_id: string | null }[] = await res.json();
  return rows[0] ?? null;
}

export async function fetchCoachById(
  coachId: string,
  slug: string,
): Promise<{ id: string; name: string; role: string } | null> {
  const res = await fetch(
    `${BASE}/rest/v1/team_coaches` +
    `?id=eq.${encodeURIComponent(coachId)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,role&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: { id: string; name: string; role: string }[] = await res.json();
  return rows[0] ?? null;
}

export async function fetchMembersByAthleteId(
  athleteId: string,
  role: "athlete" | "parent",
  slug: string,
): Promise<{ id: string; name: string; role: string; athlete_id: string | null }[]> {
  const res = await fetch(
    `${BASE}/rest/v1/team_members` +
    `?athlete_id=eq.${encodeURIComponent(athleteId)}&role=eq.${role}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,role,athlete_id`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

export async function fetchHeadCoaches(
  slug: string,
): Promise<{ id: string; name: string; role: string }[]> {
  const res = await fetch(
    `${BASE}/rest/v1/team_coaches?role=eq.head_coach&campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,role`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}
