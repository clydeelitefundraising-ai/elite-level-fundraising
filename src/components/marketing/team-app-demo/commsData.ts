// Fictional Communications data and the in-browser rules for the isolated
// Team App demo (/preview/team-app): announcement likes/comments, team
// files, direct-message and group threads. NOTHING here is a real person
// or record, and nothing is read from or written to any database — every
// change lives in the demo's React state and disappears on Reset.
//
// The messaging rules restate the app's own (lib/messages.ts, server-side,
// never bundled here) so the demo behaves like the product:
//   • athletes and parents can only start a conversation with a coach;
//   • messaging an athlete or parent automatically includes the family
//     (athlete <-> parent), in both directions;
//   • head coaches are added for oversight (as observers) whenever the
//     conversation includes an athlete/parent or wasn't started by a head
//     coach — never twice;
//   • the same set of people always reuses the same conversation;
//   • only coaches (head/assistant) create named groups; a group includes
//     the selected athletes' and staff's accounts plus athletes' families.
// Comment approval follows lib/platform/comments.ts: a Head Coach's comment
// is published immediately; everyone else's waits for approval and is only
// visible to its author until then.
//
// teamAppDemo.test.ts checks these rules against the real helpers where
// they're client-safe (participantDisplay.ts) and the scenarios they imply.

import type { ResolvedMessage, ResolvedParticipant, ThreadWithDetails } from "@/lib/messages";
import type { AnnouncementRow, TeamFileRow } from "@/lib/teamData";
import type { TeamActor } from "@/lib/permissions";
import { DEMO_ROSTER, DEMO_SLUG, JORDAN_ELLIS_ID } from "./demoData.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ── People ──────────────────────────────────────────────────────────────────

export type DemoPerson = {
  key: string;                       // "coach:<id>" | "member:<id>"
  kind: "coach" | "member";
  id: string;                        // team_coaches.id / team_members.id
  name: string;
  role: "head_coach" | "assistant_coach" | "athlete" | "parent";
  athleteId: string | null;          // roster athlete this member is / belongs to
};

const MAYA_TORRES_ID = DEMO_ROSTER[0].id;
const LUCAS_BENNETT_ID = DEMO_ROSTER[8].id;

const person = (kind: DemoPerson["kind"], n: number, name: string, role: DemoPerson["role"], athleteId: string | null = null): DemoPerson =>
  ({ key: `${kind}:${id(n)}`, kind, id: id(n), name, role, athleteId });

/** Ids line up with DEMO_ACTORS (coach 101, athlete 201, parent 301). */
export const DANA = person("coach", 101, "Dana Whitfield", "head_coach");
export const MARCUS = person("coach", 102, "Marcus Hale", "assistant_coach");
export const JORDAN = person("member", 201, "Jordan Ellis", "athlete", JORDAN_ELLIS_ID);
export const ERIN = person("member", 301, "Erin Ellis", "parent", JORDAN_ELLIS_ID);
export const MAYA = person("member", 202, "Maya Torres", "athlete", MAYA_TORRES_ID);
export const ANA = person("member", 302, "Ana Torres", "parent", MAYA_TORRES_ID);
export const LUCAS = person("member", 203, "Lucas Bennett", "athlete", LUCAS_BENNETT_ID);

export const DEMO_COACHES = [DANA, MARCUS];
/** Team members with an ELF account (the rest of the roster hasn't joined). */
export const DEMO_MEMBERS = [JORDAN, ERIN, MAYA, ANA, LUCAS];
export const DEMO_PEOPLE = [...DEMO_COACHES, ...DEMO_MEMBERS];

export function personForActor(actor: TeamActor): DemoPerson {
  if (actor.kind === "public" || actor.kind === "platform_admin") throw new Error("demo actors are coach or member");
  const key = `${actor.kind}:${actor.session.id}`;
  const p = DEMO_PEOPLE.find(x => x.key === key);
  if (!p) throw new Error(`unknown demo actor ${key}`);
  return p;
}

const byKey = (key: string) => DEMO_PEOPLE.find(p => p.key === key)!;

/** The directory the New Message picker shows (shape of /messages/directory). */
export function demoDirectory() {
  return {
    coaches: DEMO_COACHES.map(c => ({ id: c.id, name: c.name, role: c.role, photo_url: null })),
    athletes: DEMO_ROSTER.map(a => {
      const member = DEMO_MEMBERS.find(m => m.role === "athlete" && m.athleteId === a.id);
      return { athleteId: a.id, teamMemberId: member?.id ?? null, name: a.name, event: a.position, classYear: a.classYear, joined: Boolean(member), photo_url: null };
    }),
    parents: DEMO_MEMBERS.filter(m => m.role === "parent").map(p => ({ id: p.id, name: p.name, role: "parent", athlete_id: p.athleteId, photo_url: null })),
  };
}

/** The Create Group picker's directory (shape of /messages/group-directory). */
export function demoGroupDirectory() {
  return {
    athletes: demoDirectory().athletes.map(a => ({ id: a.athleteId, name: a.name, event: a.event, classYear: a.classYear, joined: a.joined })),
    staff: DEMO_COACHES.map(c => ({ id: c.id, name: c.name, role: c.role })),
  };
}

// ── Messaging rules ─────────────────────────────────────────────────────────

/** Family auto-include (athlete <-> parent) for the given member seeds. */
function familyOf(seed: DemoPerson): DemoPerson[] {
  if (seed.kind !== "member" || !seed.athleteId) return [];
  if (seed.role === "athlete") return DEMO_MEMBERS.filter(m => m.role === "parent" && m.athleteId === seed.athleteId);
  return DEMO_MEMBERS.filter(m => m.role === "athlete" && m.athleteId === seed.athleteId);
}

export type DemoParticipantSeed = { person: DemoPerson; autoIncluded: boolean; observer: boolean };

/** Who a new direct message between `from` and `to` includes. */
export function dmParticipants(from: DemoPerson, to: DemoPerson): DemoParticipantSeed[] {
  if (from.kind === "member" && to.kind !== "coach") throw new Error("Members can only start a conversation with a coach.");
  const out: DemoParticipantSeed[] = [];
  const add = (p: DemoPerson, autoIncluded: boolean, observer: boolean) => {
    if (!out.some(x => x.person.key === p.key)) out.push({ person: p, autoIncluded, observer });
  };
  add(from, false, false);
  add(to, false, false);
  for (const seed of [from, to]) for (const f of familyOf(seed)) add(f, true, false);
  const hasAthleteOrParent = out.some(x => x.person.kind === "member");
  if (hasAthleteOrParent || from.role !== "head_coach") {
    for (const hc of DEMO_COACHES.filter(c => c.role === "head_coach")) add(hc, true, true);
  }
  return out;
}

/** Who a coach-created group includes. */
export function groupParticipants(creator: DemoPerson, rosterAthleteIds: string[], staffIds: string[]): DemoParticipantSeed[] {
  if (creator.kind !== "coach") throw new Error("Only coaches create groups.");
  const out: DemoParticipantSeed[] = [];
  const add = (p: DemoPerson, autoIncluded: boolean) => {
    if (!out.some(x => x.person.key === p.key)) out.push({ person: p, autoIncluded, observer: false });
  };
  add(creator, false);
  for (const sid of staffIds) { const c = DEMO_COACHES.find(x => x.id === sid); if (c) add(c, false); }
  for (const aid of rosterAthleteIds) {
    const member = DEMO_MEMBERS.find(m => m.role === "athlete" && m.athleteId === aid);
    if (!member) continue; // a roster athlete who hasn't joined has no account to add yet
    add(member, false);
    for (const f of familyOf(member)) add(f, true);
  }
  return out;
}

// ── Threads ─────────────────────────────────────────────────────────────────

export type DemoThread = ThreadWithDetails & {
  messages: ResolvedMessage[];
  /** Per-viewer read position (actor key → ISO time). */
  readAt: Record<string, string>;
};

function participantRow(threadId: string, seed: DemoParticipantSeed, i: number): ResolvedParticipant {
  const p = seed.person;
  return {
    id: `${threadId}-p${i}`,
    actor_type: p.kind,
    coach_id: p.kind === "coach" ? p.id : null,
    member_id: p.kind === "member" ? p.id : null,
    platform_admin_id: null,
    is_auto_included: seed.autoIncluded,
    is_observer: seed.observer,
    removed_at: null,
    name: p.name,
    role: p.role,
    athlete_id: p.athleteId,
    photo_url: null,
  };
}

export function demoMessage(threadId: string, sender: DemoPerson, body: string, at: string, n: number): ResolvedMessage {
  return {
    id: `${threadId}-m${n}`,
    thread_id: threadId,
    sender_type: sender.kind,
    sender_coach_id: sender.kind === "coach" ? sender.id : null,
    sender_member_id: sender.kind === "member" ? sender.id : null,
    sender_platform_admin_id: null,
    body,
    created_at: at,
    sender_name: sender.name,
    sender_role: sender.role,
    sender_photo_url: null,
    read_at: null,
    attachments: [],
    removed: false,
  };
}

export function makeThread(opts: {
  id: string; type: "dm" | "group"; groupName?: string; creator: DemoPerson; seeds: DemoParticipantSeed[]; createdAt: string;
}): DemoThread {
  return {
    id: opts.id,
    campaign_slug: DEMO_SLUG,
    subject: null,
    thread_type: opts.type,
    group_name: opts.type === "group" ? opts.groupName ?? "Group" : null,
    archived_at: null,
    created_by_type: opts.creator.kind,
    created_by_coach_id: opts.creator.kind === "coach" ? opts.creator.id : null,
    created_by_member_id: opts.creator.kind === "member" ? opts.creator.id : null,
    created_by_platform_admin_id: null,
    creator_name: opts.creator.name,
    creator_role: opts.creator.role,
    created_at: opts.createdAt,
    last_message_at: opts.createdAt,
    last_message_preview: null,
    participants: opts.seeds.map((s, i) => participantRow(opts.id, s, i)),
    unread_count: 0,
    messages: [],
    readAt: {},
  };
}

export function withMessage(t: DemoThread, msg: ResolvedMessage, senderKey: string): DemoThread {
  return {
    ...t,
    messages: [...t.messages, msg],
    last_message_at: msg.created_at,
    last_message_preview: msg.body.slice(0, 120),
    readAt: { ...t.readAt, [senderKey]: msg.created_at },
  };
}

const participantKey = (p: ResolvedParticipant) => `${p.actor_type}:${p.actor_type === "coach" ? p.coach_id : p.member_id}`;

/** True when `viewerKey` is in the thread (as a participant or observer). */
export function isInThread(t: DemoThread, viewerKey: string): boolean {
  return t.participants.some(p => participantKey(p) === viewerKey);
}

/** The thread as one viewer sees it: their own unread count. */
export function viewThread(t: DemoThread, viewerKey: string): DemoThread {
  const since = t.readAt[viewerKey] ?? "";
  const unread = t.messages.filter(m => m.created_at > since && `${m.sender_type}:${m.sender_coach_id ?? m.sender_member_id}` !== viewerKey).length;
  return { ...t, unread_count: unread };
}

/** Canonical reuse: an existing DM with exactly these (non-observer) people. */
export function findCanonicalDm(threads: DemoThread[], seeds: DemoParticipantSeed[]): DemoThread | undefined {
  const want = seeds.filter(s => !s.observer).map(s => s.person.key).sort().join("|");
  return threads.find(t => t.thread_type === "dm"
    && t.participants.filter(p => !p.is_observer).map(participantKey).sort().join("|") === want);
}

export function buildDemoThreads(now: Date): DemoThread[] {
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

  // Coach Whitfield → Jordan: family thread (Erin auto-included).
  let t1 = makeThread({ id: id(3001), type: "dm", creator: DANA, createdAt: ago(1560), seeds: dmParticipants(DANA, JORDAN) });
  t1 = withMessage(t1, demoMessage(t1.id, DANA, "Jordan — great reads in practice today. Let's go over the red-zone film together on Tuesday.", ago(1560), 1), DANA.key);
  t1 = withMessage(t1, demoMessage(t1.id, JORDAN, "Thanks Coach! I'll be there.", ago(1500), 2), JORDAN.key);
  t1 = withMessage(t1, demoMessage(t1.id, ERIN, "Thanks for the update, Coach. He'll stay after for film on Tuesday.", ago(50), 3), ERIN.key);
  t1.readAt[ERIN.key] = ago(50);
  t1.readAt[DANA.key] = ago(1490); // Coach Whitfield saw Jordan's reply; Erin's is new

  // Coach-created group.
  let t2 = makeThread({ id: id(3002), type: "group", groupName: "QBs & Receivers", creator: DANA, createdAt: ago(200), seeds: groupParticipants(DANA, [JORDAN_ELLIS_ID, MAYA_TORRES_ID, LUCAS_BENNETT_ID], []) });
  t2 = withMessage(t2, demoMessage(t2.id, DANA, "Film at 3:30 Tuesday in Room 214. We'll walk through the red-zone package for Mesa Ridge. Bring your playbooks.", ago(180), 1), DANA.key);
  t2 = withMessage(t2, demoMessage(t2.id, MAYA, "Got it, Coach!", ago(150), 2), MAYA.key);
  t2.readAt[DANA.key] = ago(140);

  // Assistant coach → Maya: family thread, head coach included for oversight.
  let t3 = makeThread({ id: id(3003), type: "dm", creator: MARCUS, createdAt: ago(320), seeds: dmParticipants(MARCUS, MAYA) });
  t3 = withMessage(t3, demoMessage(t3.id, MARCUS, "Maya, can you stay 10 minutes after Thursday practice for route work?", ago(320), 1), MARCUS.key);
  t3 = withMessage(t3, demoMessage(t3.id, ANA, "She can — I'll pick her up at 6:10.", ago(260), 2), ANA.key);
  t3.readAt[DANA.key] = ago(250);

  // Jordan → assistant coach: family + head coach oversight.
  let t4 = makeThread({ id: id(3004), type: "dm", creator: JORDAN, createdAt: ago(1440), seeds: dmParticipants(JORDAN, MARCUS) });
  t4 = withMessage(t4, demoMessage(t4.id, JORDAN, "Coach Hale, can I get the updated wristband card before Friday?", ago(1440), 1), JORDAN.key);
  t4 = withMessage(t4, demoMessage(t4.id, MARCUS, "Yes — I'll have it for you at walkthrough.", ago(1380), 2), MARCUS.key);
  for (const p of [DANA, ERIN, JORDAN]) t4.readAt[p.key] = ago(1370);

  return [t1, t2, t3, t4];
}

// ── Announcement likes, comments, seen ──────────────────────────────────────

export type DemoComment = {
  id: string;
  announcementId: string;
  authorKey: string;
  body: string;
  status: "pending" | "approved";
  created_at: string;
};

export type DemoEngagement = {
  likes: Record<string, string[]>;           // announcement id → actor keys
  baseLikes: Record<string, number>;         // likes from the rest of the team
  comments: DemoComment[];
  seen: Record<string, string[]>;            // announcement id → names (coach "Check Seen")
};

export function buildDemoEngagement(announcements: AnnouncementRow[], now: Date): DemoEngagement {
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
  const find = (prefix: string) => announcements.find(a => a.title.startsWith(prefix))!.id;
  const pinned = find("Thursday practice");
  const away = find("Away game");
  const dinner = find("Parents:");
  const film = find("Athletes:");
  const welcome = find("Welcome");
  return {
    likes: { [pinned]: [ERIN.key], [away]: [JORDAN.key, ERIN.key] },
    baseLikes: { [pinned]: 5, [away]: 7, [welcome]: 11, [film]: 3, [dinner]: 4 },
    comments: [
      { id: id(4001), announcementId: pinned, authorKey: ERIN.key, body: "Thanks for the heads up!", status: "approved", created_at: ago(30) },
      { id: id(4002), announcementId: pinned, authorKey: LUCAS.key, body: "Got it, Coach.", status: "approved", created_at: ago(20) },
      { id: id(4003), announcementId: away, authorKey: ANA.key, body: "Can parents ride the bus, or should we drive separately?", status: "approved", created_at: ago(1300) },
      { id: id(4004), announcementId: away, authorKey: DANA.key, body: "Parents drive separately — see you there!", status: "approved", created_at: ago(1280) },
      { id: id(4005), announcementId: dinner, authorKey: ERIN.key, body: "We'll bring a salad!", status: "approved", created_at: ago(240) },
    ],
    seen: {
      [pinned]: ["Erin Ellis", "Lucas Bennett", "Maya Torres", "Jordan Ellis"],
      [away]: ["Jordan Ellis", "Erin Ellis", "Maya Torres", "Ana Torres", "Lucas Bennett"],
      [dinner]: ["Erin Ellis", "Ana Torres"],
      [film]: ["Maya Torres", "Jordan Ellis"],
      [welcome]: ["Jordan Ellis", "Erin Ellis", "Maya Torres", "Ana Torres", "Lucas Bennett"],
    },
  };
}

/** Comments one viewer can see: every approved one plus their own pending ones. */
export function visibleComments(e: DemoEngagement, announcementId: string, viewerKey: string): DemoComment[] {
  return e.comments
    .filter(c => c.announcementId === announcementId && (c.status === "approved" || c.authorKey === viewerKey))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** A new comment's status: a Head Coach's is published, anyone else's awaits approval. */
export function newCommentStatus(author: DemoPerson): DemoComment["status"] {
  return author.role === "head_coach" ? "approved" : "pending";
}

export function commentAuthor(c: DemoComment): DemoPerson {
  return byKey(c.authorKey);
}

// ── Team files ──────────────────────────────────────────────────────────────

export function buildDemoFiles(now: Date): TeamFileRow[] {
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const file = (n: number, name: string, file_type: TeamFileRow["file_type"], size_bytes: number, days: number) =>
    ({ id: id(5000 + n), campaign_slug: DEMO_SLUG, name, storage_path: "", file_type, size_bytes, uploaded_by: "Dana Whitfield", coach_id: DANA.id, created_at: ago(days) }) satisfies TeamFileRow;
  return [
    file(1, "Away Game Travel Checklist.pdf", "pdf", 98_304, 2),
    file(2, "Fall 2026 Game Schedule.pdf", "pdf", 188_416, 6),
    file(3, "Team Photo Day Flyer.png", "image", 1_258_291, 9),
  ];
}

// ── The demo's in-memory store ──────────────────────────────────────────────
//
// Pure state transitions, applied with React's functional setState in
// TeamAppDemo. Everything a visitor does lands here and nowhere else.

export type DemoStore = {
  announcements: AnnouncementRow[];
  engagement: DemoEngagement;
  threads: DemoThread[];
  files: TeamFileRow[];
  seq: number;
};

const nextId = (s: DemoStore) => id(9000 + s.seq);

export type AnnouncementDraft = Pick<AnnouncementRow, "title" | "body" | "category" | "priority" | "recipient_scope" | "recipient_athlete_id">;

export function postAnnouncement(s: DemoStore, author: DemoPerson, draft: AnnouncementDraft, at: string): DemoStore {
  const row: AnnouncementRow = {
    id: nextId(s), campaign_slug: DEMO_SLUG, ...draft,
    author_name: author.name, author_role: author.role === "head_coach" ? "Head Coach" : "Asst. Coach",
    created_at: at, updated_at: at, attachment_id: null, attachment: null, author_photo_url: null,
  };
  return { ...s, seq: s.seq + 1, announcements: [row, ...s.announcements] };
}

export function editAnnouncement(s: DemoStore, announcementId: string, draft: AnnouncementDraft): DemoStore {
  return { ...s, announcements: s.announcements.map(a => a.id === announcementId ? { ...a, ...draft } : a) };
}

export function deleteAnnouncement(s: DemoStore, announcementId: string): DemoStore {
  return { ...s, announcements: s.announcements.filter(a => a.id !== announcementId) };
}

export function toggleLike(s: DemoStore, announcementId: string, viewerKey: string): DemoStore {
  const cur = s.engagement.likes[announcementId] ?? [];
  const next = cur.includes(viewerKey) ? cur.filter(k => k !== viewerKey) : [...cur, viewerKey];
  return { ...s, engagement: { ...s.engagement, likes: { ...s.engagement.likes, [announcementId]: next } } };
}

export function likeStatus(s: DemoStore, announcementId: string, viewerKey: string) {
  const mine = s.engagement.likes[announcementId] ?? [];
  return { count: (s.engagement.baseLikes[announcementId] ?? 0) + mine.length, liked_by_me: mine.includes(viewerKey) };
}

export function addComment(s: DemoStore, announcementId: string, author: DemoPerson, body: string, at: string): DemoStore {
  const c: DemoComment = { id: nextId(s), announcementId, authorKey: author.key, body, status: newCommentStatus(author), created_at: at };
  return { ...s, seq: s.seq + 1, engagement: { ...s.engagement, comments: [...s.engagement.comments, c] } };
}

export function deleteComment(s: DemoStore, commentId: string): DemoStore {
  return { ...s, engagement: { ...s.engagement, comments: s.engagement.comments.filter(c => c.id !== commentId) } };
}

export function markThreadRead(s: DemoStore, threadId: string, viewerKey: string, at: string): DemoStore {
  return { ...s, threads: s.threads.map(t => t.id === threadId ? { ...t, readAt: { ...t.readAt, [viewerKey]: at } } : t) };
}

export function replyInThread(s: DemoStore, threadId: string, sender: DemoPerson, body: string, at: string): DemoStore {
  return {
    ...s, seq: s.seq + 1,
    threads: s.threads.map(t => t.id === threadId ? withMessage(t, demoMessage(t.id, sender, body, at, 1000 + s.seq), sender.key) : t),
  };
}

/** Starts (or reuses — same people, same conversation) a direct message. */
export function startDirectMessage(s: DemoStore, from: DemoPerson, to: DemoPerson, body: string, at: string): { store: DemoStore; threadId: string } {
  const seeds = dmParticipants(from, to);
  const existing = findCanonicalDm(s.threads, seeds);
  if (existing) return { store: replyInThread(s, existing.id, from, body, at), threadId: existing.id };
  const t = makeThread({ id: nextId(s), type: "dm", creator: from, seeds, createdAt: at });
  const withFirst = withMessage(t, demoMessage(t.id, from, body, at, 1), from.key);
  return { store: { ...s, seq: s.seq + 1, threads: [withFirst, ...s.threads] }, threadId: t.id };
}

export function createGroup(s: DemoStore, creator: DemoPerson, name: string, rosterAthleteIds: string[], staffIds: string[], at: string): { store: DemoStore; threadId: string } {
  const t = makeThread({ id: nextId(s), type: "group", groupName: name, creator, seeds: groupParticipants(creator, rosterAthleteIds, staffIds), createdAt: at });
  return { store: { ...s, seq: s.seq + 1, threads: [t, ...s.threads] }, threadId: t.id };
}

/** Threads one viewer can open, newest activity first, with their unread counts. */
export function threadsFor(s: DemoStore, viewerKey: string): DemoThread[] {
  return s.threads
    .filter(t => isInThread(t, viewerKey))
    .map(t => viewThread(t, viewerKey))
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
}

export function unreadMessageCount(s: DemoStore, viewerKey: string): number {
  return threadsFor(s, viewerKey).reduce((sum, t) => sum + t.unread_count, 0);
}
