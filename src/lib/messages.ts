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

type RawParticipant = {
  id: string;
  thread_id: string;
  actor_type: string;
  coach_id: string | null;
  member_id: string | null;
  is_auto_included: boolean;
  is_observer: boolean;
  team_coaches: { name: string; role: string } | null;
  team_members: { name: string; role: string; athlete_id: string | null } | null;
};

type RawMessage = {
  id: string;
  thread_id: string;
  sender_type: string;
  sender_coach_id: string | null;
  sender_member_id: string | null;
  body: string;
  created_at: string;
  team_coaches: { name: string; role: string } | null;
  team_members: { name: string; role: string } | null;
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
  };
}

const PARTICIPANT_SELECT =
  "id,thread_id,actor_type,coach_id,member_id,is_auto_included,is_observer," +
  "team_coaches!coach_id(name,role),team_members!member_id(name,role,athlete_id)";

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
    `team_coaches!sender_coach_id(name,role),team_members!sender_member_id(name,role)`,
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

export async function insertParticipants(
  rows: ParticipantInsert[],
): Promise<void> {
  if (!rows.length) return;
  await fetch(`${BASE}/rest/v1/message_thread_participants`, {
    method:  "POST",
    headers: h({ Prefer: "return=minimal" }),
    body:    JSON.stringify(rows),
  });
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
  await fetch(`${BASE}/rest/v1/message_reads`, {
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
  });
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
