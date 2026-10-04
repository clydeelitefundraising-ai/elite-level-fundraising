import { randomUUID } from "node:crypto";
import { checkContent } from "./moderation/contentFilter.ts";
import { getLinkedAthleteIdsForMember, getFamilyMembersForAthlete } from "./familyRelationships.ts";

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

// "platform_admin" is a real third actor kind here, not a read-only stub —
// phase_a30_platform_admin_writes.sql widened message_threads/messages/
// message_thread_participants/message_reads's CHECK constraints and added
// a platform_admin_id/sender_platform_admin_id/created_by_platform_admin_id
// column alongside the existing coach_id/member_id columns on each table
// (see that migration for exact names). A platform admin still has no
// team_coaches/team_members row — every insert below writes their
// platform_admins.id into the new column, never into coach_id/member_id.
export type ActorKey =
  | { kind: "coach";          id: string }
  | { kind: "member";         id: string }
  | { kind: "platform_admin"; id: string };

/** The id-column name matching an ActorKey's kind, for building
 *  PostgREST filters against coach_id/member_id/platform_admin_id. */
function fkColumn(kind: ActorKey["kind"]): "coach_id" | "member_id" | "platform_admin_id" {
  if (kind === "coach") return "coach_id";
  if (kind === "member") return "member_id";
  return "platform_admin_id";
}

export type ResolvedParticipant = {
  id: string;
  actor_type: "coach" | "member" | "platform_admin";
  coach_id: string | null;
  member_id: string | null;
  platform_admin_id: string | null;
  is_auto_included: boolean;
  is_observer: boolean;
  // Group Messaging G1 — null for an active participant, set for a
  // soft-removed one. Always null for every DM participant row. Only
  // populated on results from getThreadParticipants({ includeRemoved: true
  // }); the default (active-only) query never returns a removed row at
  // all, so this is always null wherever it does appear by default.
  removed_at: string | null;
  name: string;
  role: string;
  athlete_id: string | null;
  photo_url: string | null;
};

export type ResolvedMessage = {
  id: string;
  thread_id: string;
  sender_type: "coach" | "member" | "platform_admin";
  sender_coach_id: string | null;
  sender_member_id: string | null;
  sender_platform_admin_id: string | null;
  body: string;
  created_at: string;
  sender_name: string;
  sender_role: string;
  sender_photo_url: string | null;
  read_at: string | null;
  attachments: MessageAttachmentPublic[];
  // Phase A40 (moderation removal): true once a Head Coach/Platform Admin
  // has removed this message. `body` is already the neutral placeholder
  // and `attachments` is already forced empty by toResolvedMessage() below
  // whenever this is true — client code never receives the original
  // content, this flag exists purely so the UI can style the placeholder
  // distinctly from an ordinary empty/attachment-only message.
  removed: boolean;
};

export type MessageThread = {
  id: string;
  campaign_slug: string;
  subject: string | null;
  // Group Messaging G1 — "dm" for every pre-existing and ordinary 1:1
  // thread (the column default), "group" only for a coach-created named
  // group. Never inferred from participant count: a DM can have 3+
  // participants already (family auto-include, Head Coach oversight), so
  // this is an explicit, stored discriminator, not derived.
  thread_type: "dm" | "group";
  // Required (validated server-side) for thread_type "group"; always null
  // for "dm". A dedicated field, not a repurposing of `subject` (see the
  // schema migration's header comment for why).
  group_name: string | null;
  // Group Messaging G1 — Head-Coach-only archive. Null = active. DMs never
  // set this.
  archived_at: string | null;
  created_by_type: "coach" | "member" | "platform_admin";
  created_by_coach_id: string | null;
  created_by_member_id: string | null;
  created_by_platform_admin_id: string | null;
  // Durable snapshot (Phase 3C) — captured once at thread creation from
  // the resolved session, never re-derived from the live
  // created_by_coach_id/created_by_member_id join. Not currently
  // displayed anywhere in the UI (thread identity is participant-based,
  // not creator-based), but kept authoritative and non-null so it's
  // available if that ever changes, and so dropping
  // threads_creator_check doesn't leave this table without ANY durable
  // record of who started a conversation.
  creator_name: string;
  creator_role: string;
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
  actor_type: "coach" | "member" | "platform_admin";
  coach_id: string | null;
  member_id: string | null;
  platform_admin_id: string | null;
  is_auto_included: boolean;
  is_observer: boolean;
};

export type ParticipantRef = {
  actor_type: "coach" | "member" | "platform_admin";
  coach_id: string | null;
  member_id: string | null;
  platform_admin_id: string | null;
};

// ─── Message attachments (Phase 2) ────────────────────────────────────────────
//
// Full raw row shape from message_attachments (supabase/migrations/
// phase_a31_message_attachments.sql) — server-internal only. storage_path
// is a private-bucket object key and must never reach client code (see
// MessageAttachmentPublic below); nothing in this file returns this raw
// type to a caller outside messages.ts itself.
export type AttachmentStatus = "pending" | "attached";
export type AttachmentKind = "image" | "video" | "file";

export type MessageAttachment = {
  id: string;
  thread_id: string;
  message_id: string | null;
  status: AttachmentStatus;
  uploader_actor_type: "coach" | "member" | "platform_admin";
  uploader_coach_id: string | null;
  uploader_member_id: string | null;
  uploader_platform_admin_id: string | null;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  attachment_kind: AttachmentKind;
  created_at: string;
  // Phase A40 (moderation removal) — set once a Head Coach/Platform Admin
  // has removed this attachment (independently, or as part of removing
  // its parent message). Never null-checked by callers outside this
  // file's own resolveAuthorizedAttachment()/getAttachmentByIdServer()
  // gate below — that is the ONLY place old links/paths get rejected.
  removed_at: string | null;
};

// Client/API-safe view of an attached (never pending) attachment — the
// shape embedded on ResolvedMessage.attachments and the only attachment
// shape this module ever hands back to a route/UI. Deliberately omits
// storage_path (never needed client-side — downloads go through an
// authenticated-by-thread-participation route keyed on attachment id, not
// exposed here yet) and the uploader/thread/status/message_id bookkeeping
// fields, which are write-path/verification concerns, not display ones —
// the parent ResolvedMessage already carries sender identity.
export type MessageAttachmentPublic = {
  id: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  attachment_kind: AttachmentKind;
  created_at: string;
};

// ─── Attachment validation (locked limits) ────────────────────────────────────

export const MAX_ATTACHMENTS_PER_MESSAGE = 6;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_BYTES  = 25 * 1024 * 1024;

export const MAX_BYTES_BY_KIND: Record<AttachmentKind, number> = {
  image: MAX_IMAGE_BYTES,
  video: MAX_VIDEO_BYTES,
  file:  MAX_FILE_BYTES,
};

// MIME -> kind. Also doubles as the allow-list: any MIME type not present
// here is rejected outright, regardless of size.
const MIME_TO_KIND: Record<string, AttachmentKind> = {
  "image/jpeg": "image",
  "image/png":  "image",
  "image/webp": "image",
  "image/heic": "image",
  "image/heif": "image",
  "video/mp4":       "video",
  "video/quicktime": "video",
  "application/pdf":    "file",
  "application/msword": "file",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "file",
};

// MIME -> a safe, fixed extension. Deliberately keyed off the *validated*
// MIME type, never the client-supplied filename — a filename is arbitrary
// client input and must never determine the storage object's extension.
const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4":       "mp4",
  "video/quicktime": "mov",
  "application/pdf":    "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function classifyAttachmentMime(mimeType: string): AttachmentKind | null {
  return MIME_TO_KIND[mimeType] ?? null;
}

export function safeExtensionForMime(mimeType: string): string | null {
  return MIME_TO_EXTENSION[mimeType] ?? null;
}

export type AttachmentValidationErrorCode =
  | "unsupported_mime"
  | "invalid_size"
  | "too_large"
  | "too_many_attachments";

export type AttachmentValidationError = {
  code: AttachmentValidationErrorCode;
  message: string;
};

export type AttachmentFileValidationResult =
  | { ok: true; kind: AttachmentKind }
  | { ok: false; error: AttachmentValidationError };

/** Validates one file's MIME type and size against the locked per-kind
 *  limits. Does not know about (and never enforces) the per-message
 *  attachment count — see validateAttachmentCount for that. */
export function validateAttachmentFile(params: {
  mimeType: string;
  byteSize: number;
}): AttachmentFileValidationResult {
  const kind = classifyAttachmentMime(params.mimeType);
  if (!kind) {
    return {
      ok: false,
      error: { code: "unsupported_mime", message: `File type "${params.mimeType}" is not supported.` },
    };
  }
  if (!Number.isFinite(params.byteSize) || params.byteSize <= 0) {
    return { ok: false, error: { code: "invalid_size", message: "File appears to be empty." } };
  }
  const maxBytes = MAX_BYTES_BY_KIND[kind];
  if (params.byteSize > maxBytes) {
    return {
      ok: false,
      error: {
        code: "too_large",
        message: `File exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit for ${kind}s.`,
      },
    };
  }
  return { ok: true, kind };
}

/** Validates the TOTAL number of attachments a message would carry
 *  (existing + incoming, for an API route that wants to check before
 *  accepting more uploads) against the locked per-message maximum. */
export function validateAttachmentCount(totalCount: number): { ok: true } | { ok: false; error: AttachmentValidationError } {
  if (totalCount > MAX_ATTACHMENTS_PER_MESSAGE) {
    return {
      ok: false,
      error: {
        code: "too_many_attachments",
        message: `A message can have at most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments.`,
      },
    };
  }
  return { ok: true };
}

// ─── Request-shape validation (Phase 3) ────────────────────────────────────────
//
// Pure request-shape checks extracted out of the API routes so they're
// directly unit-testable without an HTTP mocking framework. None of
// these perform or replace any authorization, ownership, thread, or
// status check — those remain the caller's job (isParticipant) or the
// send_message_with_attachments RPC's job. These only answer "is this
// request shaped sensibly" — max lengths/counts, required-one-of,
// duplicates, required fields present with the right JS type.

export type SendRequestValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/** The reply/send endpoint's request-shape rules: body <= 3000 chars,
 *  at most MAX_ATTACHMENTS_PER_MESSAGE ids, non-empty body OR >=1
 *  attachment id required, and no duplicate ids in the array. `body`
 *  should already be trimmed by the caller. */
export function validateSendRequest(params: {
  body: string;
  attachmentIds: string[];
}): SendRequestValidationResult {
  if (params.body.length > 3000) {
    return { ok: false, error: "Message too long." };
  }
  if (params.attachmentIds.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { ok: false, error: `A message can have at most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments.` };
  }
  if (!params.body && params.attachmentIds.length === 0) {
    return { ok: false, error: "body required" };
  }
  if (new Set(params.attachmentIds).size !== params.attachmentIds.length) {
    return { ok: false, error: "Duplicate attachment ids." };
  }
  // Phase A39: server-side objectionable-content filter (Apple Guideline
  // 1.2). Checked here — inside the one shape-validation function the
  // send route already calls — rather than as a separate step a future
  // caller could forget to invoke. Only runs when there's a body to check;
  // an attachment-only message has nothing to filter.
  if (params.body) {
    const contentCheck = checkContent(params.body);
    if (!contentCheck.ok) return { ok: false, error: contentCheck.message };
  }
  return { ok: true };
}

export type SignRequestParseResult =
  | { ok: true; originalFilename: string; mimeType: string; byteSize: number }
  | { ok: false; error: string };

/** Parses/validates the sign endpoint's raw request body shape only
 *  (required fields present, correct JS type) — NOT MIME/size limits,
 *  which stay validateAttachmentFile's job. Deliberately reads only
 *  original_filename/mime_type/byte_size — the three fields the sign
 *  endpoint is allowed to trust from the client; nothing resembling
 *  storage_path, an attachment id, or an uploader id is ever read here. */
export function parseSignRequestBody(body: unknown): SignRequestParseResult {
  const b = body as { original_filename?: unknown; mime_type?: unknown; byte_size?: unknown } | null;
  const originalFilename = typeof b?.original_filename === "string" ? b.original_filename.trim() : "";
  const mimeType         = typeof b?.mime_type === "string" ? b.mime_type : "";
  const byteSize         = typeof b?.byte_size === "number" ? b.byte_size : NaN;

  if (!originalFilename || !mimeType || !Number.isFinite(byteSize)) {
    return { ok: false, error: "original_filename, mime_type, and byte_size are required." };
  }
  return { ok: true, originalFilename, mimeType, byteSize };
}

export type ResolveRequestParseResult =
  | { ok: true; recipientActorType: string; recipientId: string }
  | { ok: false; error: string };

/** Parses/validates the resolve endpoint's raw request body shape —
 *  intentionally as loose as the existing POST /messages/threads route's
 *  own check (truthiness only, no strict "coach"|"member" enum
 *  validation here) so the two endpoints' recipient-shape behavior never
 *  diverges: an invalid recipient_actor_type falls through to
 *  resolveOrCreateThreadForRecipient's own "Recipient not found" 404,
 *  exactly as it always has for the existing route. */
export function parseResolveRequestBody(body: unknown): ResolveRequestParseResult {
  const b = body as { recipient_actor_type?: unknown; recipient_id?: unknown } | null;
  if (!b?.recipient_actor_type || !b?.recipient_id) {
    return { ok: false, error: "recipient required" };
  }
  return { ok: true, recipientActorType: String(b.recipient_actor_type), recipientId: String(b.recipient_id) };
}

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
// A platform admin has no team_coaches/team_members row to carry
// name/role/photo — those live on elf_accounts via platform_admins.account_id.
export type RawPlatformAdminInfo = { elf_accounts: { name: string; profile_photo_url: string | null } | null };

export function resolvePhotoUrl(
  coach: RawCoachInfo | null,
  member: RawMemberInfo | null,
  platformAdmin?: RawPlatformAdminInfo | null,
): string | null {
  if (member?.role === "athlete" && member.athletes?.profile_photo) return member.athletes.profile_photo;
  return coach?.elf_accounts?.profile_photo_url
    ?? member?.elf_accounts?.profile_photo_url
    ?? platformAdmin?.elf_accounts?.profile_photo_url
    ?? null;
}

type RawParticipant = {
  id: string;
  thread_id: string;
  actor_type: string;
  coach_id: string | null;
  member_id: string | null;
  platform_admin_id: string | null;
  is_auto_included: boolean;
  is_observer: boolean;
  removed_at: string | null;
  team_coaches: RawCoachInfo | null;
  team_members: RawMemberInfo | null;
  platform_admins: RawPlatformAdminInfo | null;
};

// Only the public-safe fields are ever selected for the embed (see
// ATTACHMENT_EMBED_SELECT) — storage_path/uploader/status/message_id are
// deliberately never fetched here, so there is no raw value to
// accidentally forward to a client even by omission-bug.
type RawMessageAttachment = MessageAttachmentPublic;

type RawMessage = {
  id: string;
  thread_id: string;
  sender_type: string;
  sender_coach_id: string | null;
  sender_member_id: string | null;
  sender_platform_admin_id: string | null;
  sender_name: string;
  sender_role: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
  team_coaches: RawCoachInfo | null;
  team_members: RawMemberInfo | null;
  message_attachments: RawMessageAttachment[] | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveParticipant(raw: RawParticipant): ResolvedParticipant {
  return {
    id: raw.id,
    actor_type: raw.actor_type as "coach" | "member" | "platform_admin",
    coach_id: raw.coach_id,
    member_id: raw.member_id,
    platform_admin_id: raw.platform_admin_id,
    is_auto_included: raw.is_auto_included,
    is_observer: raw.is_observer,
    removed_at: raw.removed_at,
    name: raw.team_coaches?.name ?? raw.team_members?.name ?? raw.platform_admins?.elf_accounts?.name ?? "Unknown",
    role: raw.team_coaches?.role ?? raw.team_members?.role ?? (raw.platform_admins ? "platform_admin" : ""),
    athlete_id: raw.team_members?.athlete_id ?? null,
    photo_url: resolvePhotoUrl(raw.team_coaches, raw.team_members, raw.platform_admins),
  };
}

const COACH_INFO_SELECT  = "name,role,elf_accounts!account_id(profile_photo_url)";
const MEMBER_INFO_SELECT = "name,role,athlete_id,athletes!athlete_id(profile_photo),elf_accounts!account_id(profile_photo_url)";
const PLATFORM_ADMIN_INFO_SELECT = "elf_accounts!account_id(name,profile_photo_url)";

const PARTICIPANT_SELECT =
  "id,thread_id,actor_type,coach_id,member_id,platform_admin_id,is_auto_included,is_observer,removed_at," +
  `team_coaches!coach_id(${COACH_INFO_SELECT}),team_members!member_id(${MEMBER_INFO_SELECT}),` +
  `platform_admins!platform_admin_id(${PLATFORM_ADMIN_INFO_SELECT})`;

// Only ever the public-safe columns — see MessageAttachmentPublic/
// RawMessageAttachment. PostgREST resolves this embed via
// message_attachments.message_id -> messages.id; a pending (unclaimed)
// attachment has message_id = NULL and so never appears in any message's
// embed, which is exactly the desired "existing/text-only messages come
// back with attachments: []" behavior — no extra filtering needed.
const ATTACHMENT_EMBED_SELECT =
  "message_attachments(id,original_filename,mime_type,byte_size,attachment_kind,created_at)";

// ─── Thread list ──────────────────────────────────────────────────────────────

export async function getThreadsForActor(
  slug: string,
  actor: ActorKey,
): Promise<ThreadWithDetails[]> {
  const fk = fkColumn(actor.kind);

  // Group Messaging G1: a soft-removed participant (removed_at set) no
  // longer belongs to this thread at all — excluded here, which is also
  // what keeps a removed participant's threads out of every downstream
  // step below (unread count, participant list, etc.), since none of them
  // see a thread_id this query didn't return. Always NULL for every DM
  // participant row, so this is a no-op filter for existing DM behavior.
  const ptRes = await fetch(
    `${BASE}/rest/v1/message_thread_participants` +
    `?actor_type=eq.${actor.kind}&${fk}=eq.${encodeURIComponent(actor.id)}&removed_at=is.null&select=thread_id`,
    { headers: h(), cache: "no-store" },
  );
  if (!ptRes.ok) return [];
  const ptRows: { thread_id: string }[] = await ptRes.json();
  if (!ptRows.length) return [];

  const inClause = `(${ptRows.map(r => r.thread_id).join(",")})`;

  const [threadRes, participantsRes, msgRes] = await Promise.all([
    // Group Messaging G1: an archived group is excluded from every
    // participant's thread list (DMs never set archived_at, so this is
    // also a no-op filter for existing behavior).
    fetch(
      `${BASE}/rest/v1/message_threads?id=in.${inClause}&archived_at=is.null&order=last_message_at.desc&limit=50`,
      { headers: h(), cache: "no-store" },
    ),
    // Group Messaging G1 correction: this builds the participant list
    // shown alongside each thread in the thread list — a removed
    // participant must not appear there either (same removed_at=is.null
    // consistency rule as everywhere else; no-op for DMs).
    fetch(
      `${BASE}/rest/v1/message_thread_participants?thread_id=in.${inClause}&removed_at=is.null&select=${PARTICIPANT_SELECT}`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/messages?thread_id=in.${inClause}&select=id,thread_id,sender_coach_id,sender_member_id,sender_platform_admin_id`,
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

  type MsgStub = { id: string; thread_id: string; sender_coach_id: string | null; sender_member_id: string | null; sender_platform_admin_id: string | null };
  const msgs: MsgStub[] = msgRes.ok ? await msgRes.json() : [];

  const othersMessages = msgs.filter(m => {
    if (actor.kind === "coach") return m.sender_coach_id !== actor.id;
    if (actor.kind === "member") return m.sender_member_id !== actor.id;
    return m.sender_platform_admin_id !== actor.id;
  });

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

// Group Messaging G1: an archived group is treated as entirely
// inaccessible, not a separate "view archived history" mode — this
// function is the single chokepoint for thread detail, message send,
// read-marking, and this phase's own group rename/participants routes
// (every one of them calls getThreadById and already treats a null result
// as "not found"), so filtering archived_at here centralizes the
// enforcement instead of sprinkling an archived_at check into each route.
// Always a no-op for DMs (archived_at is never set on a DM thread).
export async function getThreadById(
  threadId: string,
  slug: string,
): Promise<MessageThread | null> {
  const res = await fetch(
    `${BASE}/rest/v1/message_threads` +
    `?id=eq.${encodeURIComponent(threadId)}&campaign_slug=eq.${encodeURIComponent(slug)}&archived_at=is.null&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: MessageThread[] = await res.json();
  return rows[0] ?? null;
}

// Group Messaging G1: returns only ACTIVE participants by default
// (removed_at IS NULL) — this is "who currently has access," used for the
// UI participant list, push recipient resolution, and blocking checks.
// Always true for every DM participant row (removed_at is only ever set by
// group-management code), so this is a no-op filter for existing DM
// behavior. Pass includeRemoved:true only for group-management reads that
// need to see a removed row too (e.g. deciding whether to reactivate it).
export async function getThreadParticipants(
  threadId: string,
  opts?: { includeRemoved?: boolean },
): Promise<ResolvedParticipant[]> {
  const removedFilter = opts?.includeRemoved ? "" : "&removed_at=is.null";
  const res = await fetch(
    `${BASE}/rest/v1/message_thread_participants` +
    `?thread_id=eq.${encodeURIComponent(threadId)}${removedFilter}&select=${PARTICIPANT_SELECT}`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  const rows: RawParticipant[] = await res.json();
  return rows.map(resolveParticipant);
}

// Phase A37 fix: resolveOrCreateThreadForRecipient's block check only
// ever ran on the thread-creation/lookup path — it was never consulted
// when sending into an ALREADY-OPEN thread the caller already has a
// thread_id for, which is how every message after the first one in a
// conversation is actually sent (see
// api/team/[slug]/messages/threads/[threadId]/messages/route.ts). This
// is the fix: checked against EVERY other participant in the thread
// (not just a single "recipient"), since a thread can include
// auto-included family/oversight participants — if the actor has a
// block relationship (either direction) with ANY of them, the message
// would still reach a blocked party, so the whole send is refused. A
// participant who IS the actor themself is obviously excluded.
export async function isThreadBlockedForActor(
  threadId: string,
  slug: string,
  actor: ActorKey,
): Promise<boolean> {
  const { isBlockedEitherDirection } = await import("./moderation/blocks.ts");
  const participants = await getThreadParticipants(threadId);
  for (const p of participants) {
    const otherId = p.actor_type === "coach" ? p.coach_id : p.actor_type === "member" ? p.member_id : p.platform_admin_id;
    if (!otherId) continue;
    if (p.actor_type === actor.kind && otherId === actor.id) continue; // self
    if (await isBlockedEitherDirection(slug, actor, { kind: p.actor_type, id: otherId })) {
      return true;
    }
  }
  return false;
}

// Group Messaging G1: this is the single authorization chokepoint every
// route uses to gate thread detail, message send, read-marking, and
// attachment sign/download (see call sites) — adding removed_at=is.null
// here is therefore the one change that makes a soft-removed participant
// immediately lose all of that access, with no other route needing to know
// about removal at all. Always a no-op for DMs (removed_at never set).
//
// Group Messaging G1 (archived groups): also rejects if the THREAD itself
// is archived — needed specifically because attachment sign/download
// (resolveAuthorizedAttachment, below) authorizes purely via this function
// and never calls getThreadById, so that function's own archived_at filter
// never reaches this path. getThreadById's filter already covers thread
// detail/send/read-marking independently; this is the second (and only
// other) place archived-group enforcement needs to live, per the "two
// chokepoints, not sprinkled per-route" design. Always a no-op for DMs
// (archived_at is never set on a DM thread).
export async function isParticipant(
  threadId: string,
  actor: ActorKey,
): Promise<boolean> {
  const fk = fkColumn(actor.kind);
  const [participantRes, threadRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/message_thread_participants` +
      `?thread_id=eq.${encodeURIComponent(threadId)}` +
      `&actor_type=eq.${actor.kind}&${fk}=eq.${encodeURIComponent(actor.id)}` +
      `&removed_at=is.null` +
      `&select=id&limit=1`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/message_threads?id=eq.${encodeURIComponent(threadId)}&select=archived_at&limit=1`,
      { headers: h(), cache: "no-store" },
    ),
  ]);
  if (!threadRes.ok) return false;
  const threadRows: { archived_at: string | null }[] = await threadRes.json();
  if (!threadRows[0] || threadRows[0].archived_at) return false;

  if (!participantRes.ok) return false;
  const rows: { id: string }[] = await participantRes.json();
  return rows.length > 0;
}

const MESSAGE_ROW_SELECT =
  "id,thread_id,sender_type,sender_coach_id,sender_member_id,sender_platform_admin_id,sender_name,sender_role,body,created_at,deleted_at," +
  `team_coaches!sender_coach_id(${COACH_INFO_SELECT}),team_members!sender_member_id(${MEMBER_INFO_SELECT}),` +
  ATTACHMENT_EMBED_SELECT;

const MODERATION_REMOVED_PLACEHOLDER = "Message removed by moderator";

// Shared by getMessagesForThread and getResolvedMessageById (Phase 3) so
// the two never drift on what a "resolved message" looks like.
//
// Phase A40: a moderation-removed message (deleted_at set) is
// UNCONDITIONALLY re-rendered here with the neutral placeholder body and
// zero attachments, regardless of what the underlying row actually
// contains — this is the single chokepoint both read paths share, so a
// future bug in the removal write path (e.g. forgetting to blank body)
// can never leak original content to a client, since this function would
// still substitute the placeholder.
function toResolvedMessage(r: RawMessage, readAt: string | null): ResolvedMessage {
  const removed = Boolean(r.deleted_at);
  return {
    id: r.id,
    thread_id: r.thread_id,
    sender_type: r.sender_type as "coach" | "member" | "platform_admin",
    sender_coach_id: r.sender_coach_id,
    sender_member_id: r.sender_member_id,
    sender_platform_admin_id: r.sender_platform_admin_id,
    body: removed ? MODERATION_REMOVED_PLACEHOLDER : r.body,
    removed,
    created_at: r.created_at,
    // Durable snapshot (Phase 3C) — the authoritative historical display
    // identity, immune to what later happens to the live
    // team_coaches/team_members relationship. The live join above is used
    // ONLY for sender_photo_url, which is allowed to gracefully
    // disappear (Avatar falls back to initials) once that relationship
    // is gone.
    sender_name: r.sender_name,
    sender_role: r.sender_role,
    sender_photo_url: resolvePhotoUrl(r.team_coaches, r.team_members),
    read_at: readAt,
    attachments: removed ? [] : (r.message_attachments ?? []),
  };
}

export async function getMessagesForThread(
  threadId: string,
  actor: ActorKey,
  limit = 50,
): Promise<ResolvedMessage[]> {
  const res = await fetch(
    `${BASE}/rest/v1/messages?thread_id=eq.${encodeURIComponent(threadId)}` +
    `&order=created_at.asc&limit=${limit}` +
    // Deterministic attachment ordering within each message's embed —
    // created_at first, id as a stable tiebreak for same-instant uploads.
    `&message_attachments.order=created_at.asc,id.asc&message_attachments.removed_at=is.null` +
    `&select=${MESSAGE_ROW_SELECT}`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  const rows: RawMessage[] = await res.json();
  if (!rows.length) return [];

  const fk = fkColumn(actor.kind);
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

  return rows.map(r => toResolvedMessage(r, readMap.get(r.id) ?? null));
}

/** Single-message equivalent of getMessagesForThread — used by the
 *  attachment-send route (Phase 3) to return the just-sent message in the
 *  exact same client-safe ResolvedMessage shape (attachments included),
 *  rather than inventing a second response format. `actor` is the
 *  CALLER's own actor key, used only to look up their own read_at (which
 *  will be null immediately after sending their own message — read_at is
 *  irrelevant to the sender, but kept for shape consistency). */
export async function getResolvedMessageById(
  messageId: string,
  actor: ActorKey,
): Promise<ResolvedMessage | null> {
  const res = await fetch(
    `${BASE}/rest/v1/messages?id=eq.${encodeURIComponent(messageId)}&limit=1` +
    `&message_attachments.order=created_at.asc,id.asc&message_attachments.removed_at=is.null` +
    `&select=${MESSAGE_ROW_SELECT}`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: RawMessage[] = await res.json();
  const r = rows[0];
  if (!r) return null;

  const fk = fkColumn(actor.kind);
  const readsRes = await fetch(
    `${BASE}/rest/v1/message_reads?actor_type=eq.${actor.kind}&${fk}=eq.${encodeURIComponent(actor.id)}` +
    `&message_id=eq.${encodeURIComponent(messageId)}&select=read_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const reads: { read_at: string }[] = readsRes.ok ? await readsRes.json() : [];

  return toResolvedMessage(r, reads[0]?.read_at ?? null);
}

// ─── Unread count (for nav badge) ─────────────────────────────────────────────

export async function getUnreadMessageCount(
  actor: ActorKey,
): Promise<number> {
  const fk = fkColumn(actor.kind);

  const ptRes = await fetch(
    `${BASE}/rest/v1/message_thread_participants` +
    `?actor_type=eq.${actor.kind}&${fk}=eq.${encodeURIComponent(actor.id)}&removed_at=is.null&select=thread_id`,
    { headers: h(), cache: "no-store" },
  );
  if (!ptRes.ok) return 0;
  const ptRows: { thread_id: string }[] = await ptRes.json();
  if (!ptRows.length) return 0;

  const inClause = `(${ptRows.map(r => r.thread_id).join(",")})`;
  const msgRes = await fetch(
    `${BASE}/rest/v1/messages?thread_id=in.${inClause}&select=id,sender_coach_id,sender_member_id,sender_platform_admin_id`,
    { headers: h(), cache: "no-store" },
  );
  if (!msgRes.ok) return 0;
  const msgs: { id: string; sender_coach_id: string | null; sender_member_id: string | null; sender_platform_admin_id: string | null }[] =
    await msgRes.json();

  const others = msgs.filter(m => {
    if (actor.kind === "coach") return m.sender_coach_id !== actor.id;
    if (actor.kind === "member") return m.sender_member_id !== actor.id;
    return m.sender_platform_admin_id !== actor.id;
  });
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
// the COMPLETE required family group via the canonical family-relationships
// module (familyRelationships.ts) — never inferred from name/email/display
// data, and never from the legacy team_members.athlete_id column alone
// (Family Relationships Phase B fix: a parent linked to a second child only
// through team_member_athletes used to be invisible to this function). For
// each seed member that is an athlete or a parent, this unions every
// athlete that seed is linked to (legacy column + join table), then returns
// every team_members row (the athlete row + every currently-linked parent
// row, from either relationship source) for each of those athletes — so it
// works identically regardless of whether the athlete or a parent is the
// one already in the thread, and regardless of which child a given seed
// happens to be linked to. Always re-derives relationships from a fresh,
// campaign-scoped read — never trusts a caller-supplied athlete_id or
// campaign.
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
    if (seed.role !== "athlete" && seed.role !== "parent") continue;
    const linked = await getLinkedAthleteIdsForMember(seed.id, seed.athlete_id);
    for (const id of linked) athleteIds.add(id);
  }
  if (!athleteIds.size) return [];

  const familyGroups = await Promise.all(
    [...athleteIds].map(athleteId => getFamilyMembersForAthlete(athleteId, campaignSlug)),
  );
  const familyMemberIds = new Set<string>();
  for (const group of familyGroups) for (const m of group) familyMemberIds.add(m.id);

  return [...familyMemberIds].map(id => ({ actor_type: "member" as const, coach_id: null, member_id: id, platform_admin_id: null }));
}

// Group Messaging G3A — family resolution seeded DIRECTLY from roster
// athlete ids (athletes.id), rather than from team_members seeds. Unlike
// resolveRequiredFamilyParticipants() above (which must first resolve a
// team_members seed row to an athlete_id before it can look up family),
// this never requires the athlete to have joined at all: getFamilyMembersForAthlete()
// already accepts an athletes.id directly and unions the legacy
// team_members.athlete_id column with team_member_athletes, so an approved
// parent qualifies purely from the roster id — exactly the locked G3A
// product requirement that a parent can gain group access before their
// child ever creates an ELF account. (This also means the result already
// includes the athlete's OWN team_members row when one exists — callers
// that separately add a joined athlete as a direct participant first are
// unaffected: upsertParticipantActive() no-ops on a row that's already
// active, regardless of which call added it.)
export async function resolveRequiredFamilyParticipantsForRosterAthletes(
  athleteIds: string[],
  campaignSlug: string,
): Promise<ParticipantRef[]> {
  if (!athleteIds.length) return [];
  const familyGroups = await Promise.all(
    [...new Set(athleteIds)].map(athleteId => getFamilyMembersForAthlete(athleteId, campaignSlug)),
  );
  const familyMemberIds = new Set<string>();
  for (const group of familyGroups) for (const m of group) familyMemberIds.add(m.id);
  return [...familyMemberIds].map(id => ({ actor_type: "member" as const, coach_id: null, member_id: id, platform_admin_id: null }));
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
      thread_id:         threadId,
      actor_type:        "member" as const,
      coach_id:          null,
      member_id:         m.member_id,
      platform_admin_id: null,
      is_auto_included:  true,
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

  // Member-seeded sync (unchanged, pre-G3A behavior): only runs when the
  // athlete has an actual team_members row of their own, e.g. for DMs and
  // any group the athlete personally joined before this parent was linked.
  if (athleteMembers.length) {
    const memberIds = athleteMembers.map(m => m.id);
    // Group Messaging G1: only threads where the athlete is still an ACTIVE
    // participant are backfill candidates — if a coach removed this athlete
    // from a group, a parent newly linked afterward has no reason to be
    // added to that group. No-op filter for DMs (removed_at never set there).
    const ptRes = await fetch(
      `${BASE}/rest/v1/message_thread_participants` +
      `?actor_type=eq.member&member_id=in.(${memberIds.map(encodeURIComponent).join(",")})` +
      `&removed_at=is.null&select=thread_id`,
      { headers: h(), cache: "no-store" },
    );
    const ptRows: { thread_id: string }[] = ptRes.ok ? await ptRes.json() : [];

    if (ptRows.length) {
      const threadIds = [...new Set(ptRows.map(r => r.thread_id))];
      const inClause = `(${threadIds.map(encodeURIComponent).join(",")})`;

      // Restrict to: same campaign, not archived, AND has at least one ACTIVE
      // coach participant. Group Messaging G1 correction: this coach-presence
      // check previously didn't filter removed_at, so a thread whose only
      // coach had been soft-removed could still look like a valid sync target;
      // every other "current/active participant" concept G1 introduced means
      // removed_at IS NULL, and this is no exception. archived_at=is.null
      // matches this phase's "an archived group is inaccessible, not a sync
      // target" rule. Both filters are no-ops for DMs (neither column is ever
      // set on a DM thread).
      const [threadsRes, coachPartsRes] = await Promise.all([
        fetch(
          `${BASE}/rest/v1/message_threads?id=in.${inClause}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&archived_at=is.null&select=id`,
          { headers: h(), cache: "no-store" },
        ),
        fetch(
          `${BASE}/rest/v1/message_thread_participants?thread_id=in.${inClause}&actor_type=eq.coach&removed_at=is.null&select=thread_id`,
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
  }

  // Group Messaging G3A addition: roster-assignment-seeded sync — covers
  // the case the member-seeded lookup above can never find at all, a
  // roster-only (never-joined) athlete who has active message_thread_athletes
  // assignments but no team_members row of their own. Deliberately the SAME
  // centralized function (not a second synchronization architecture): this
  // is the only other place a newly-approved parent can qualify for group
  // access, and it is handled here, inline, every time this function runs.
  const rosterThreadIds = await getActiveAssignedGroupThreadIds(athleteId, campaignSlug);
  if (rosterThreadIds.length) {
    const required = await resolveRequiredFamilyParticipantsForRosterAthletes([athleteId], campaignSlug);
    for (const threadId of rosterThreadIds) {
      for (const r of required) {
        if (!r.member_id) continue;
        await upsertParticipantActive({
          thread_id: threadId, actor_type: "member", coach_id: null, member_id: r.member_id,
          platform_admin_id: null, is_auto_included: true, is_observer: false,
        });
      }
    }
  }
}

// ─── Group messaging (Phase G1) ───────────────────────────────────────────────
//
// A coach-created named group is still just a message_threads row + a
// message_thread_participants join — no second messaging system. The only
// NEW ideas here are: (1) thread_type/group_name distinguish a group from a
// DM so it never goes through findCanonicalExistingThread()'s DM-only
// "identical participant set = same conversation" reuse (two differently-
// named groups with identical membership must coexist, per product
// decision), and (2) soft removal (removed_at), reusing the EXISTING
// is_auto_included flag as the only provenance distinction needed:
// is_auto_included=false means "a coach directly chose this athlete/staff
// member," is_auto_included=true means "added solely because of a family
// relationship to a directly-chosen athlete." Family reconciliation after a
// manual removal only ever touches is_auto_included=true member rows —
// manually-chosen athletes, staff, and the creating coach are never
// candidates for removal by this logic, so no new participant-provenance
// model was needed.
//
// Coaches select ATHLETES and STAFF only (never parents directly, per
// product decision) — resolveRequiredFamilyParticipants()/
// getFamilyMembersForAthlete() (familyRelationships.ts, unmodified) remain
// the ONLY source of parent inclusion, exactly as for DMs.
//
// ─── message_thread_athletes (Phase G3A — roster assignment) ────────────────
//
// A SEPARATE concept from message_thread_participants, by locked
// architectural decision: message_thread_athletes records WHICH roster
// athletes (athletes.id) a coach assigned to a group — regardless of
// whether that athlete has ever joined ELF — while
// message_thread_participants continues to record ONLY authenticated,
// message-capable identities (team_members.id / team_coaches.id). Roster
// assignment is never itself sufficient to read/send/receive; see
// isParticipant()/getThreadParticipants() (unchanged) for the actual
// authorization chokepoint. Never stores an athletes.id in
// message_thread_participants.member_id.

type RawRosterAssignment = { id: string; removed_at: string | null };

// Reactivate-or-insert, same idiom as upsertParticipantActive() below — the
// table's plain UNIQUE(thread_id, athlete_id) index guarantees at most one
// row ever exists per pair, active or not.
async function upsertRosterAssignmentActive(threadId: string, athleteId: string): Promise<void> {
  const existingRes = await fetch(
    `${BASE}/rest/v1/message_thread_athletes` +
    `?thread_id=eq.${encodeURIComponent(threadId)}&athlete_id=eq.${encodeURIComponent(athleteId)}&select=id,removed_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const rows: RawRosterAssignment[] = existingRes.ok ? await existingRes.json() : [];
  const existing = rows[0];
  if (existing) {
    if (existing.removed_at) {
      await fetch(
        `${BASE}/rest/v1/message_thread_athletes?id=eq.${encodeURIComponent(existing.id)}`,
        { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ removed_at: null }) },
      );
    }
    return;
  }
  const res = await fetch(`${BASE}/rest/v1/message_thread_athletes`, {
    method:  "POST",
    headers: h({ Prefer: "return=minimal" }),
    body:    JSON.stringify({ thread_id: threadId, athlete_id: athleteId }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("[messages] upsertRosterAssignmentActive insert failed:", res.status, detail);
    throw new ParticipantSyncError("roster-assignment-insert");
  }
}

// Soft-remove: sets removed_at, never deletes — mirrors
// softRemoveParticipantRow()'s exact semantics (history/read state is
// unaffected; nothing references message_thread_athletes by FK). Idempotent.
async function softRemoveRosterAssignment(threadId: string, athleteId: string): Promise<void> {
  await fetch(
    `${BASE}/rest/v1/message_thread_athletes` +
    `?thread_id=eq.${encodeURIComponent(threadId)}&athlete_id=eq.${encodeURIComponent(athleteId)}&removed_at=is.null`,
    { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ removed_at: new Date().toISOString() }) },
  );
}

// Every actively-assigned roster athlete for a thread — the "who is on the
// roster for this group" read Manage Group (G3B) will need, and the set
// family reconciliation re-derives from after a roster removal.
export async function getActiveRosterAssignments(threadId: string): Promise<string[]> {
  const res = await fetch(
    `${BASE}/rest/v1/message_thread_athletes?thread_id=eq.${encodeURIComponent(threadId)}&removed_at=is.null&select=athlete_id`,
    { headers: h(), cache: "no-store" },
  );
  const rows: { athlete_id: string }[] = res.ok ? await res.json() : [];
  return rows.map(r => r.athlete_id);
}

export type RosterAssignmentWithStatus = {
  athlete_id: string;
  name: string;
  joined: boolean;
};

// Smallest safe server representation for G3B's Manage Group view: every
// actively-assigned roster athlete for a thread, with a server-resolved
// `joined` flag — so the client never has to infer join status from
// anything else (e.g. presence/absence in message_thread_participants,
// which is an authorization concept, not a display one). Deliberately
// excludes any team_members id — the client has no legitimate use for an
// internal joined-identity id; the server already resolves it internally
// wherever activation/removal actually needs it.
export async function getGroupRosterAssignments(
  threadId: string,
  campaignSlug: string,
): Promise<RosterAssignmentWithStatus[]> {
  const athleteIds = await getActiveRosterAssignments(threadId);
  if (!athleteIds.length) return [];
  const inClause = `(${athleteIds.map(encodeURIComponent).join(",")})`;

  const [athletesRes, joinedRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/athletes?id=in.${inClause}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=id,name`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/team_members?athlete_id=in.${inClause}&role=eq.athlete&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=athlete_id`,
      { headers: h(), cache: "no-store" },
    ),
  ]);
  const athletes: { id: string; name: string }[] = athletesRes.ok ? await athletesRes.json() : [];
  const joinedIds = new Set<string>(
    (joinedRes.ok ? await joinedRes.json() : []).map((m: { athlete_id: string }) => m.athlete_id),
  );

  return athletes.map(a => ({ athlete_id: a.id, name: a.name, joined: joinedIds.has(a.id) }));
}

// Every NON-ARCHIVED group thread (this campaign only) this athlete is
// currently actively assigned to. The shared reverse-lookup behind BOTH
// G3A activation hooks: "athlete joins" (activateRosterAssignmentsForJoinedAthlete)
// and "parent approved later" (the addition inside syncParentIntoAthleteThreads
// above). Never returns a DM thread id — message_thread_athletes rows are
// only ever written for thread_type='group' threads by this module.
//
// G3A review correction: this deliberately does NOT require an active coach
// PARTICIPANT row, unlike syncParentIntoAthleteThreads's older, member-
// seeded lookup above. That check conflates "has an active coach
// participant right now" with "is a legitimate, currently-manageable
// group" — those are not the same thing. canManageGroupThread() already
// lets a Head Coach manage ANY group on the team regardless of whether they
// personally participate in it, and removing a coach from staff entirely
// (removeStaffRelationship -> a hard DELETE on team_coaches, pre-existing,
// untouched by G3A) CASCADEs their message_thread_participants rows away
// without going through removeGroupParticipant()'s "last coach" guard at
// all — so an otherwise perfectly valid, non-archived group CAN end up
// with zero active coach participants today, through no fault of the
// group itself. Requiring one here would incorrectly block a roster
// athlete or late-approved parent from ever activating into that group
// again, even though the team's real Head Coach can still open and manage
// it. archived_at IS NULL is G1's actual, deliberate "this group is no
// longer valid" signal (see phase_g1's own migration) — that is the
// correct and sufficient validity check, kept here unchanged; it never
// depends on a specific coach id or on the original creator remaining
// active.
async function getActiveAssignedGroupThreadIds(athleteId: string, campaignSlug: string): Promise<string[]> {
  const assignRes = await fetch(
    `${BASE}/rest/v1/message_thread_athletes?athlete_id=eq.${encodeURIComponent(athleteId)}&removed_at=is.null&select=thread_id`,
    { headers: h(), cache: "no-store" },
  );
  const assignRows: { thread_id: string }[] = assignRes.ok ? await assignRes.json() : [];
  if (!assignRows.length) return [];
  const threadIds = [...new Set(assignRows.map(r => r.thread_id))];
  const inClause = `(${threadIds.map(encodeURIComponent).join(",")})`;

  const threadsRes = await fetch(
    `${BASE}/rest/v1/message_threads?id=in.${inClause}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&thread_type=eq.group&archived_at=is.null&select=id`,
    { headers: h(), cache: "no-store" },
  );
  const validThreadIds = new Set<string>(
    (threadsRes.ok ? await threadsRes.json() : []).map((t: { id: string }) => t.id),
  );
  return threadIds.filter(id => validThreadIds.has(id));
}

// Called from createLinkedAthleteMember() (src/lib/platform/athletes.ts) via
// a dynamic import, immediately after an athlete's own team_members
// identity is established — see that file's comment for the exact
// dependency-direction rationale. Finds every active roster-group
// assignment for this athlete in this campaign and activates their real
// team_members.id as a direct participant, then re-runs the existing
// family sync for that thread so a previously-roster-only-qualified parent
// is reconciled against the athlete's now-real identity too. No-op if the
// athlete has no roster assignments. Idempotent — safe to call on every
// join/re-join.
export async function activateRosterAssignmentsForJoinedAthlete(
  athleteId: string,
  campaignSlug: string,
  memberId: string,
): Promise<void> {
  const threadIds = await getActiveAssignedGroupThreadIds(athleteId, campaignSlug);
  for (const threadId of threadIds) {
    await upsertParticipantActive({
      thread_id: threadId, actor_type: "member", coach_id: null, member_id: memberId,
      platform_admin_id: null, is_auto_included: false, is_observer: false,
    });
    await syncRequiredThreadParticipants(threadId, campaignSlug);
  }
}

export const GROUP_NAME_MAX_LENGTH = 80;

export type GroupNameValidationResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

export function validateGroupName(raw: unknown): GroupNameValidationResult {
  if (typeof raw !== "string") return { ok: false, error: "Group name is required." };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Group name is required." };
  if (trimmed.length > GROUP_NAME_MAX_LENGTH) {
    return { ok: false, error: `Group name must be ${GROUP_NAME_MAX_LENGTH} characters or fewer.` };
  }
  return { ok: true, name: trimmed };
}

// Pure, independently testable — the route is responsible for first
// confirming the actor is a real team_coaches row (never a platform admin;
// platform-admin group management is deliberately out of scope for G1, see
// the G1 report) before calling this. Head Coach manages every group on the
// team; an Assistant Coach manages only the group they personally created.
export function canManageGroupThread(
  actorRole: "head_coach" | "assistant_coach",
  actorCoachId: string,
  thread: Pick<MessageThread, "created_by_type" | "created_by_coach_id">,
): boolean {
  if (actorRole === "head_coach") return true;
  return thread.created_by_type === "coach" && thread.created_by_coach_id === actorCoachId;
}

// Reactivate-or-insert: looks up any EXISTING row (active or soft-removed)
// for this exact (thread, actor) — the existing partial unique indexes
// (mtp_coach_uniq/mtp_member_uniq) guarantee at most one such row ever
// exists — and flips removed_at back to NULL if it was removed, inserts a
// fresh row if none exists, or does nothing if already active. Never
// creates a second/duplicate participant identity for the same actor.
async function upsertParticipantActive(row: ParticipantInsert): Promise<void> {
  const fk = fkColumn(row.actor_type);
  const id = row.coach_id ?? row.member_id ?? row.platform_admin_id;
  const existingRes = await fetch(
    `${BASE}/rest/v1/message_thread_participants` +
    `?thread_id=eq.${encodeURIComponent(row.thread_id)}&actor_type=eq.${row.actor_type}` +
    `&${fk}=eq.${encodeURIComponent(id as string)}&select=id,removed_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const existingRows: { id: string; removed_at: string | null }[] = existingRes.ok ? await existingRes.json() : [];
  const existing = existingRows[0];

  if (existing) {
    if (existing.removed_at) {
      const patchRes = await fetch(
        `${BASE}/rest/v1/message_thread_participants?id=eq.${encodeURIComponent(existing.id)}`,
        { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ removed_at: null }) },
      );
      if (!patchRes.ok) throw new ParticipantSyncError("reactivate");
    }
    return;
  }

  await insertParticipants([row]);
}

// Soft-remove: sets removed_at, never deletes the row — message_reads rows
// referencing this participant's past messages are untouched (message_reads
// has no FK to message_thread_participants at all), and the row itself
// remains available for upsertParticipantActive() to reactivate later.
// Idempotent — a no-op if already removed.
async function softRemoveParticipantRow(threadId: string, ref: ParticipantRef): Promise<void> {
  const fk = fkColumn(ref.actor_type);
  const id = ref.coach_id ?? ref.member_id ?? ref.platform_admin_id;
  await fetch(
    `${BASE}/rest/v1/message_thread_participants` +
    `?thread_id=eq.${encodeURIComponent(threadId)}&actor_type=eq.${ref.actor_type}` +
    `&${fk}=eq.${encodeURIComponent(id as string)}&removed_at=is.null`,
    { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ removed_at: new Date().toISOString() }) },
  );
}

// After a manual removal, re-derives the required family set from whatever
// directly-chosen (is_auto_included=false) athlete seeds are STILL active,
// and soft-removes any currently-active auto-included member participant
// no longer justified by that recomputed set. A parent linked to two
// participating athletes is untouched as long as at least one of those
// athletes is still active — resolveRequiredFamilyParticipants() already
// unions every linked athlete per seed, so this never needs bespoke
// per-parent bookkeeping. Never touches a manually-chosen (is_auto_included
// =false) row or a coach/staff row — reconciliation is member+auto-included
// only, by construction.
async function reconcileFamilyParticipantsAfterRemoval(
  threadId: string,
  campaignSlug: string,
): Promise<void> {
  const current = await getThreadParticipants(threadId);
  const activeSeedMemberIds = current
    .filter(p => p.actor_type === "member" && !p.is_auto_included)
    .map(p => p.member_id as string);

  const required = await resolveRequiredFamilyParticipants(activeSeedMemberIds, campaignSlug);
  const requiredIds = new Set(required.map(r => r.member_id));

  const toRemove = current.filter(p => p.actor_type === "member" && p.is_auto_included && !requiredIds.has(p.member_id));
  for (const p of toRemove) {
    await softRemoveParticipantRow(threadId, {
      actor_type: "member", coach_id: null, member_id: p.member_id, platform_admin_id: null,
    });
  }
}

export type CreateGroupResult =
  | { ok: true; thread: MessageThread }
  | { ok: false; error: string; status: number };

// Always creates a brand-new thread — deliberately never calls
// findCanonicalExistingThread() (that reuse logic is DM-only; two
// differently-named groups with identical membership must coexist, per
// product decision) and never calls resolveOrCreateThreadForRecipient()
// (that function's single-recipient/member-can-message-coach-only shape
// doesn't fit a coach-authored, multi-participant group at all).
export async function createGroupThread(params: {
  slug: string;
  creatorCoachId: string;
  creatorName: string;
  creatorRole: string;
  name: string;
  rosterAthleteIds: string[]; // G3A: athletes.id — validated against this campaign by the caller (route)
  coachIds: string[];         // validated staff team_coaches ids
}): Promise<CreateGroupResult> {
  const { slug, creatorCoachId, creatorName, creatorRole, name, rosterAthleteIds, coachIds } = params;

  const seen = new Set<string>();
  const participants: Omit<ParticipantInsert, "thread_id">[] = [];
  function addParticipant(actor_type: "coach" | "member", id: string, is_auto_included: boolean) {
    const key = `${actor_type}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    participants.push({
      actor_type,
      coach_id:          actor_type === "coach"  ? id : null,
      member_id:         actor_type === "member" ? id : null,
      platform_admin_id: null,
      is_auto_included,
      is_observer:       false,
    });
  }

  addParticipant("coach", creatorCoachId, false);
  for (const id of coachIds) addParticipant("coach", id, false);

  // G3A: a roster athlete who already has a joined (athlete-role)
  // team_members identity is seeded as a DIRECT participant (same as
  // pre-G3A behavior) — never auto-included. A roster-only athlete with no
  // team_members row contributes NO participant row at all here; their
  // assignment is recorded separately below, after the thread exists.
  const dedupedRosterAthleteIds = [...new Set(rosterAthleteIds)];
  const joinedMemberIds: string[] = [];
  for (const athleteId of dedupedRosterAthleteIds) {
    const joined = await fetchMembersByAthleteId(athleteId, "athlete", slug);
    if (joined[0]) joinedMemberIds.push(joined[0].id);
  }
  for (const memberId of joinedMemberIds) addParticipant("member", memberId, false);

  // Family resolution is seeded from the FULL roster selection (not just
  // the joined subset) — an approved parent of a roster-only, never-joined
  // athlete qualifies immediately, per the locked G3A product requirement.
  const familyParticipants = await resolveRequiredFamilyParticipantsForRosterAthletes(dedupedRosterAthleteIds, slug);
  for (const fp of familyParticipants) {
    if (fp.member_id) addParticipant("member", fp.member_id, true);
  }

  const threadRes = await fetch(`${BASE}/rest/v1/message_threads`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify({
      campaign_slug:        slug,
      thread_type:          "group",
      group_name:           name,
      subject:              null,
      created_by_type:      "coach",
      created_by_coach_id:  creatorCoachId,
      created_by_member_id: null,
      created_by_platform_admin_id: null,
      creator_name:         creatorName,
      creator_role:         creatorRole,
      last_message_preview: null,
    }),
  });
  if (!threadRes.ok) {
    return { ok: false, error: "Failed to create group.", status: 500 };
  }
  const [thread] = await threadRes.json();

  const ptInserts: ParticipantInsert[] = participants.map(p => ({ ...p, thread_id: thread.id }));
  try {
    await insertParticipants(ptInserts);
    for (const athleteId of dedupedRosterAthleteIds) {
      await upsertRosterAssignmentActive(thread.id, athleteId);
    }
  } catch {
    return { ok: false, error: "Failed to set up group participants. Please try again.", status: 500 };
  }

  return { ok: true, thread };
}

export async function renameGroupThread(threadId: string, name: string): Promise<void> {
  await fetch(`${BASE}/rest/v1/message_threads?id=eq.${encodeURIComponent(threadId)}`, {
    method:  "PATCH",
    headers: h({ Prefer: "return=minimal" }),
    body:    JSON.stringify({ group_name: name }),
  });
}

export async function archiveGroupThread(threadId: string): Promise<void> {
  await fetch(`${BASE}/rest/v1/message_threads?id=eq.${encodeURIComponent(threadId)}`, {
    method:  "PATCH",
    headers: h({ Prefer: "return=minimal" }),
    body:    JSON.stringify({ archived_at: new Date().toISOString() }),
  });
}

// Adds (or reactivates) one or more directly-chosen athlete/staff
// participants, then re-syncs family inclusion from the thread's FULL
// current set of active directly-chosen athlete seeds (not just the newly
// added ones) — so a previously-removed parent who is required again (e.g.
// their other linked athlete is still in the group, or the just-re-added
// athlete needs them) is reactivated by the same upsert, never left behind.
// A newly (re)added participant sees the thread's full existing history —
// there is no join-time message filter anywhere in this schema, matching
// the existing, unmodified late-parent-link behavior.
export async function addGroupParticipants(params: {
  threadId: string;
  campaignSlug: string;
  rosterAthleteIds: string[]; // G3A: athletes.id — validated against this campaign by the caller (route)
  coachIds: string[];
}): Promise<void> {
  const { threadId, campaignSlug, rosterAthleteIds, coachIds } = params;

  for (const id of coachIds) {
    await upsertParticipantActive({
      thread_id: threadId, actor_type: "coach", coach_id: id, member_id: null, platform_admin_id: null,
      is_auto_included: false, is_observer: false,
    });
  }
  for (const athleteId of new Set(rosterAthleteIds)) {
    await upsertRosterAssignmentActive(threadId, athleteId);
    const joined = await fetchMembersByAthleteId(athleteId, "athlete", campaignSlug);
    if (joined[0]) {
      await upsertParticipantActive({
        thread_id: threadId, actor_type: "member", coach_id: null, member_id: joined[0].id, platform_admin_id: null,
        is_auto_included: false, is_observer: false,
      });
    }
  }

  // Re-sync family inclusion from the thread's FULL current active roster
  // assignment set (not just the newly added ones) — same "full current
  // set, not just new" rule the pre-G3A version already followed, now
  // seeded from message_thread_athletes instead of direct member rows, so
  // an approved parent of a roster-only (never-joined) sibling already in
  // the group is never missed.
  const activeAssignments = await getActiveRosterAssignments(threadId);
  const required = await resolveRequiredFamilyParticipantsForRosterAthletes(activeAssignments, campaignSlug);
  for (const r of required) {
    if (!r.member_id) continue;
    await upsertParticipantActive({
      thread_id: threadId, actor_type: "member", coach_id: null, member_id: r.member_id, platform_admin_id: null,
      is_auto_included: true, is_observer: false,
    });
  }
}

export type RemoveGroupParticipantResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

// Removes exactly one DIRECTLY-chosen (is_auto_included=false) participant
// — never an auto-included family row directly (that would bypass
// reconciliation and leave inconsistent state); removing the athlete that
// justified a parent's inclusion removes the parent via
// reconcileFamilyParticipantsAfterRemoval() instead. Refuses to remove the
// last active coach from a group (never leaves a group with zero
// management identity) — broader creator-specific removal semantics are
// deliberately not invented here, see the G1 report.
export async function removeGroupParticipant(
  threadId: string,
  campaignSlug: string,
  ref: ParticipantRef,
): Promise<RemoveGroupParticipantResult> {
  const fk = fkColumn(ref.actor_type);
  const id = ref.coach_id ?? ref.member_id ?? ref.platform_admin_id;
  const res = await fetch(
    `${BASE}/rest/v1/message_thread_participants` +
    `?thread_id=eq.${encodeURIComponent(threadId)}&actor_type=eq.${ref.actor_type}` +
    `&${fk}=eq.${encodeURIComponent(id as string)}&removed_at=is.null&select=id,is_auto_included`,
    { headers: h(), cache: "no-store" },
  );
  const rows: { id: string; is_auto_included: boolean }[] = res.ok ? await res.json() : [];
  const row = rows[0];
  if (!row) {
    return { ok: false, error: "Participant not found in this group.", status: 404 };
  }
  if (row.is_auto_included) {
    return { ok: false, error: "This person was added automatically through a family relationship and can't be removed directly.", status: 400 };
  }

  if (ref.actor_type === "coach") {
    const current = await getThreadParticipants(threadId);
    const otherActiveCoaches = current.filter(p => p.actor_type === "coach" && p.coach_id !== ref.coach_id);
    if (otherActiveCoaches.length === 0) {
      return { ok: false, error: "A group must have at least one coach.", status: 400 };
    }
  }

  await softRemoveParticipantRow(threadId, ref);
  if (ref.actor_type === "member") {
    await reconcileFamilyParticipantsAfterRemoval(threadId, campaignSlug);
  }
  return { ok: true };
}

export type RemoveRosterAthleteResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

// G3A — the counterpart to removeGroupParticipant() for roster athletes,
// needed because a roster-only (never-joined) athlete has no team_members.id
// to pass to that function at all; this takes the roster athlete's
// athletes.id directly. Soft-removes the roster assignment, soft-removes
// the athlete's own active participant row if one exists (the joined
// case), then reconciles family participants from the thread's REMAINING
// active roster assignments — so a parent linked to another still-assigned
// sibling in this exact thread is never disturbed (same reconciliation
// shape as reconcileFamilyParticipantsAfterRemoval, re-derived from roster
// assignments instead of direct member seeds). Staff/coach rows are never
// touched by this function.
export async function removeRosterAthleteFromGroup(
  threadId: string,
  campaignSlug: string,
  athleteId: string,
): Promise<RemoveRosterAthleteResult> {
  const activeRes = await fetch(
    `${BASE}/rest/v1/message_thread_athletes?thread_id=eq.${encodeURIComponent(threadId)}&athlete_id=eq.${encodeURIComponent(athleteId)}&removed_at=is.null&select=id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const rows: { id: string }[] = activeRes.ok ? await activeRes.json() : [];
  if (!rows[0]) {
    return { ok: false, error: "Athlete is not assigned to this group.", status: 404 };
  }

  await softRemoveRosterAssignment(threadId, athleteId);

  const joined = await fetchMembersByAthleteId(athleteId, "athlete", campaignSlug);
  if (joined[0]) {
    await softRemoveParticipantRow(threadId, {
      actor_type: "member", coach_id: null, member_id: joined[0].id, platform_admin_id: null,
    });
  }

  await reconcileFamilyParticipantsAfterRosterRemoval(threadId, campaignSlug);
  return { ok: true };
}

// Roster-assignment-seeded counterpart to reconcileFamilyParticipantsAfterRemoval
// above — re-derives the required family set from whatever roster
// assignments (message_thread_athletes) are STILL active after a removal,
// and soft-removes any currently-active auto-included member participant no
// longer justified by that recomputed set. A parent linked to two assigned
// siblings is untouched as long as at least one sibling's assignment is
// still active. Never touches a directly-chosen (is_auto_included=false)
// row or a coach/staff row.
async function reconcileFamilyParticipantsAfterRosterRemoval(
  threadId: string,
  campaignSlug: string,
): Promise<void> {
  const current = await getThreadParticipants(threadId);
  const activeAssignments = await getActiveRosterAssignments(threadId);
  const required = await resolveRequiredFamilyParticipantsForRosterAthletes(activeAssignments, campaignSlug);
  const requiredIds = new Set(required.map(r => r.member_id));

  const toRemove = current.filter(p => p.actor_type === "member" && p.is_auto_included && !requiredIds.has(p.member_id));
  for (const p of toRemove) {
    await softRemoveParticipantRow(threadId, {
      actor_type: "member", coach_id: null, member_id: p.member_id, platform_admin_id: null,
    });
  }
}

// G3A review correction — called from deleteAthleteWithMessagingCleanup()
// (src/lib/platform/athletes.ts) via a dynamic import, BEFORE an athletes
// row is hard-deleted. Required ordering: message_thread_athletes.athlete_id
// has an ON DELETE CASCADE FK to athletes(id), so the instant the athletes
// row is gone, every one of this athlete's assignment rows is erased by the
// database automatically — there would be nothing left to discover which
// threads needed cleanup if this ran AFTER the delete. The caller is
// responsible for calling this first and only deleting the athlete if this
// resolves without throwing.
//
// Reuses removeRosterAthleteFromGroup() per thread — the exact same
// soft-remove-assignment + soft-remove-joined-participant + family
// reconciliation steps as a coach manually removing the athlete from one
// group, just applied to every group at once. No duplicated removal logic.
//
// Throws (ParticipantSyncError) if the initial assignment lookup itself
// fails, so the caller can safely refuse to proceed with the athlete
// deletion rather than risk silently leaving a stale, still-authorized
// participant behind with no supporting roster row.
export async function removeRosterAthleteFromAllGroups(
  athleteId: string,
  campaignSlug: string,
): Promise<void> {
  const res = await fetch(
    `${BASE}/rest/v1/message_thread_athletes?athlete_id=eq.${encodeURIComponent(athleteId)}&removed_at=is.null&select=thread_id`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) {
    const detail = await res.text();
    console.error("[messages] removeRosterAthleteFromAllGroups: assignment lookup failed:", res.status, detail);
    throw new ParticipantSyncError("roster-delete-cleanup-lookup");
  }
  const rows: { thread_id: string }[] = await res.json();
  const threadIds = [...new Set(rows.map(r => r.thread_id))];
  for (const threadId of threadIds) {
    await removeRosterAthleteFromGroup(threadId, campaignSlug, athleteId);
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
    .map(p => `${p.actor_type}:${p.coach_id ?? p.member_id ?? p.platform_admin_id}`)
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

  const fk = fkColumn(actor.kind);
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
    // Group Messaging G1: restricted to thread_type=dm — a coach-created
    // group's participant set could coincidentally match a DM's (e.g. a
    // 2-person "group" with one staff member and no athletes has the exact
    // same 2-coach key a direct coach-to-coach DM would), and a DM must
    // never silently reuse a named group's thread. Groups never reach this
    // function from the other direction either (createGroupThread() never
    // calls it) — this filter is the only change needed to make the
    // exclusion symmetric.
    fetch(
      `${BASE}/rest/v1/message_threads?id=in.${inClause}` +
      `&campaign_slug=eq.${encodeURIComponent(slug)}&thread_type=eq.dm` +
      `&select=id,campaign_slug,subject,created_by_type,created_by_coach_id,created_by_member_id,created_by_platform_admin_id,creator_name,creator_role,last_message_at,last_message_preview,created_at` +
      `&order=last_message_at.desc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/message_thread_participants?thread_id=in.${inClause}&select=thread_id,actor_type,coach_id,member_id,platform_admin_id,is_observer`,
      { headers: h(), cache: "no-store" },
    ),
  ]);
  const threads: MessageThread[] = threadsRes.ok ? await threadsRes.json() : [];
  if (!threads.length) return null;

  type PartStub = { thread_id: string; actor_type: string; coach_id: string | null; member_id: string | null; platform_admin_id: string | null; is_observer: boolean };
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
      .map(p => ({
        actor_type: p.actor_type as "coach" | "member" | "platform_admin",
        coach_id: p.coach_id, member_id: p.member_id, platform_admin_id: p.platform_admin_id,
      }));
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
      thread_id:         threadId,
      actor_type:        "coach" as const,
      coach_id:          id,
      member_id:         null,
      platform_admin_id: null,
      is_auto_included:  true,
      is_observer:       true,
    })),
  );
}

// senderName/senderRole (Phase 3C) — the durable snapshot, always
// resolved by the caller from the authenticated server-side session
// (actor.session.name/role) and never trusted from client input. This is
// the same pattern already used by createComment()'s authorName/
// authorRole (Phase 3B-2).
export async function insertMessage(
  threadId: string,
  actor: ActorKey,
  body: string,
  senderName: string,
  senderRole: string,
): Promise<{ id: string; created_at: string } | null> {
  const res = await fetch(`${BASE}/rest/v1/messages`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify({
      thread_id:                 threadId,
      sender_type:               actor.kind,
      sender_coach_id:           actor.kind === "coach"          ? actor.id : null,
      sender_member_id:          actor.kind === "member"         ? actor.id : null,
      sender_platform_admin_id:  actor.kind === "platform_admin" ? actor.id : null,
      sender_name:      senderName,
      sender_role:      senderRole,
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
          message_id:         id,
          actor_type:         actor.kind,
          coach_id:           actor.kind === "coach"          ? actor.id : null,
          member_id:          actor.kind === "member"         ? actor.id : null,
          platform_admin_id:  actor.kind === "platform_admin" ? actor.id : null,
          read_at:            now,
        })),
      ),
    },
  );
}

// ─── Mark thread read (Phase 2B QA fix) ───────────────────────────────────────
//
// Root cause of the Preview regression where opening a thread never cleared
// its unread state: the /read route used to filter with
// `${fk}=neq.<actorId>` directly in PostgREST, where fk was the READER's own
// actor-type column (e.g. sender_member_id for a member reader). Messages
// sent by the OTHER actor type have that column NULL, and `NULL <> value`
// evaluates to NULL (no match) in Postgres — so every message from the other
// actor type was silently excluded from the read-marking set, which is the
// overwhelmingly common case (a member's unread messages are almost always
// from a coach, and vice versa). This mirrors the exact "other people's
// messages" filter already proven correct in getThreadsForActor/
// getUnreadMessageCount: fetch every message in the thread, then exclude the
// actor's own by JS equality, which — unlike SQL neq — handles null fine.
export async function markThreadReadForActor(
  threadId: string,
  actor: ActorKey,
): Promise<void> {
  const res = await fetch(
    `${BASE}/rest/v1/messages?thread_id=eq.${encodeURIComponent(threadId)}` +
    `&select=id,sender_coach_id,sender_member_id,sender_platform_admin_id`,
    { headers: h(), cache: "no-store" },
  );
  const msgs: { id: string; sender_coach_id: string | null; sender_member_id: string | null; sender_platform_admin_id: string | null }[] =
    res.ok ? await res.json() : [];
  const others = msgs.filter(m => {
    if (actor.kind === "coach") return m.sender_coach_id !== actor.id;
    if (actor.kind === "member") return m.sender_member_id !== actor.id;
    return m.sender_platform_admin_id !== actor.id;
  });
  await markMessagesReadForActor(others.map(m => m.id), actor);
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

// Pure: maps an ActorKey to the exact three-way coach_id/member_id/
// platform_admin_id column shape used for both uploader_* (message_
// attachments) and p_sender_* (the send_message_with_attachments RPC
// params) — same three-way exclusivity pattern used everywhere else in
// this schema. Extracted so the "exactly one column stamped, matching
// actor.kind" behavior is independently testable without a network call.
export function actorIdColumns(actor: ActorKey): {
  coach_id: string | null;
  member_id: string | null;
  platform_admin_id: string | null;
} {
  return {
    coach_id:          actor.kind === "coach"          ? actor.id : null,
    member_id:         actor.kind === "member"         ? actor.id : null,
    platform_admin_id: actor.kind === "platform_admin" ? actor.id : null,
  };
}

// ─── Attachment write path (Phase 2) ──────────────────────────────────────────
//
// Lifecycle recap (see the approved design + phase_a31 migration): a
// pending row is created here, before any message exists, scoped to a
// thread the caller has ALREADY been authorized against by the route
// (isParticipant — this module never re-derives that). It is only ever
// claimed by the send_message_with_attachments Postgres RPC
// (sendMessageWithAttachments below), atomically with the message insert
// — never by a second, non-transactional UPDATE from this file.

export const MESSAGE_ATTACHMENTS_BUCKET = "message-attachments";

export type CreatePendingAttachmentError = AttachmentValidationError | {
  code: "insert_failed";
  message: string;
};

export type CreatePendingAttachmentResult =
  | { ok: true; attachmentId: string; storagePath: string; kind: AttachmentKind }
  | { ok: false; error: CreatePendingAttachmentError };

/** Creates a 'pending' message_attachments row for a file the caller is
 *  about to upload. Generates the attachment id and storage_path
 *  server-side — NEVER accepts either from the client — so a claimed or
 *  guessed path can't be supplied by a caller. The path is thread-scoped
 *  (`${threadId}/${id}.${ext}`), matching the design's storage-path
 *  convention; `threadId` must already be a real thread the caller has
 *  been authorized against (isParticipant) by the route BEFORE this is
 *  called — this function performs no authorization of its own. */
export async function createPendingAttachment(params: {
  threadId: string;
  actor: ActorKey;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
}): Promise<CreatePendingAttachmentResult> {
  const validation = validateAttachmentFile({ mimeType: params.mimeType, byteSize: params.byteSize });
  if (!validation.ok) return { ok: false, error: validation.error };

  // Unreachable in practice (validateAttachmentFile already rejects any
  // MIME not present in MIME_TO_KIND, and MIME_TO_KIND/MIME_TO_EXTENSION
  // share the exact same key set) — kept as a defensive type-narrowing
  // guard rather than a non-null assertion on safeExtensionForMime.
  const ext = safeExtensionForMime(params.mimeType);
  if (!ext) {
    return {
      ok: false,
      error: { code: "unsupported_mime", message: `File type "${params.mimeType}" is not supported.` },
    };
  }

  const id = randomUUID();
  const storagePath = `${params.threadId}/${id}.${ext}`;
  const uploaderColumns = actorIdColumns(params.actor);

  const res = await fetch(`${BASE}/rest/v1/message_attachments`, {
    method:  "POST",
    headers: h({ Prefer: "return=minimal" }),
    body:    JSON.stringify({
      id,
      thread_id:           params.threadId,
      status:              "pending",
      uploader_actor_type: params.actor.kind,
      uploader_coach_id:          uploaderColumns.coach_id,
      uploader_member_id:         uploaderColumns.member_id,
      uploader_platform_admin_id: uploaderColumns.platform_admin_id,
      storage_path:      storagePath,
      original_filename: params.originalFilename,
      mime_type:          params.mimeType,
      byte_size:          params.byteSize,
      attachment_kind:    validation.kind,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("[messages] createPendingAttachment insert failed:", res.status, detail);
    return { ok: false, error: { code: "insert_failed", message: "Failed to prepare attachment upload." } };
  }

  return { ok: true, attachmentId: id, storagePath, kind: validation.kind };
}

export type SignedAttachmentUploadResult =
  | { ok: true; signedUploadUrl: string }
  | { ok: false; error: string };

/** Signed upload URL for the PRIVATE message-attachments bucket — same
 *  Supabase Storage sign-upload pattern already used for team-files (see
 *  api/team/[slug]/files/sign/route.ts), targeting the new bucket
 *  instead. Never makes the bucket public, never returns a permanent
 *  public URL — only a short-lived signed PUT target for this one
 *  storage_path. */
export async function createSignedAttachmentUploadUrl(
  storagePath: string,
): Promise<SignedAttachmentUploadResult> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/storage/v1/object/upload/sign/${MESSAGE_ATTACHMENTS_BUCKET}/${storagePath}`,
    {
      method:  "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body:    JSON.stringify({}),
    },
  );
  if (!res.ok) {
    const msg = await res.text();
    console.error("[messages] createSignedAttachmentUploadUrl failed:", res.status, msg);
    return { ok: false, error: "Failed to create upload URL." };
  }

  const body = await res.json();
  const relativeUrl: string = body.signedURL ?? body.url ?? "";
  if (!relativeUrl) return { ok: false, error: "No signed URL returned from storage." };

  // The raw Storage REST response's `url` field is relative to the
  // Storage API root (`{project}/storage/v1`), NOT the bare project
  // root — confirmed directly from the installed @supabase/supabase-js
  // source (SupabaseClient.ts: `this.storageUrl = new URL('storage/v1',
  // baseUrl)`, which is the exact base the SDK's own
  // createSignedUploadUrl/uploadToSignedUrl reconstruct this same
  // relative value against). BASE here is that bare project root (same
  // as NEXT_PUBLIC_SUPABASE_URL), so it must have /storage/v1 re-added —
  // matching the request URL just above, which already includes it.
  return {
    ok: true,
    signedUploadUrl: relativeUrl.startsWith("http") ? relativeUrl : `${BASE}/storage/v1${relativeUrl}`,
  };
}

export const STALE_PENDING_MS = 24 * 60 * 60 * 1000;

/** Pure: the ISO cutoff timestamp below which a 'pending' attachment
 *  counts as stale, as of `now` (defaults to the real current time —
 *  overridable so the 24h boundary itself is testable without faking the
 *  system clock). Rows with created_at older than this are eligible for
 *  sweepStalePendingAttachments's cleanup. */
export function stalePendingCutoffIso(now: number = Date.now()): string {
  return new Date(now - STALE_PENDING_MS).toISOString();
}

/** Bounded, request-triggered cleanup — NOT a background job. Intended to
 *  be called opportunistically by the sign endpoint (a later phase) each
 *  time it's invoked for a given thread, so abandoned composer uploads
 *  don't accumulate forever without needing any new scheduled
 *  infrastructure. Deletes the DB rows first, then makes a best-effort
 *  attempt to delete the corresponding Storage objects — a Storage
 *  failure is logged (by count/status only, never by path or filename)
 *  and never propagates to the caller. */
export async function sweepStalePendingAttachments(threadId: string): Promise<void> {
  const cutoff = stalePendingCutoffIso();

  const staleRes = await fetch(
    `${BASE}/rest/v1/message_attachments` +
    `?thread_id=eq.${encodeURIComponent(threadId)}&status=eq.pending&created_at=lt.${encodeURIComponent(cutoff)}` +
    `&select=id,storage_path`,
    { headers: h(), cache: "no-store" },
  );
  if (!staleRes.ok) return;
  const stale: { id: string; storage_path: string }[] = await staleRes.json();
  if (!stale.length) return;

  const idsClause = stale.map(s => s.id).join(",");
  const deleteRes = await fetch(
    `${BASE}/rest/v1/message_attachments?id=in.(${idsClause})`,
    { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
  );
  if (!deleteRes.ok) {
    console.error("[messages] sweepStalePendingAttachments: failed to delete stale rows, status", deleteRes.status);
    return; // don't attempt storage cleanup for rows we couldn't confirm removed
  }

  try {
    const storageRes = await fetch(`${BASE}/storage/v1/object/${MESSAGE_ATTACHMENTS_BUCKET}`, {
      method:  "DELETE",
      headers: h(),
      body:    JSON.stringify({ prefixes: stale.map(s => s.storage_path) }),
    });
    if (!storageRes.ok) {
      console.error("[messages] sweepStalePendingAttachments: storage cleanup failed, status", storageRes.status);
    }
  } catch (err) {
    console.error("[messages] sweepStalePendingAttachments: storage cleanup threw", err);
  }
}

/** Rollback for a pending attachment whose signed-upload-URL step failed
 *  (see the sign endpoint, Phase 3) — deletes the DB row (scoped to
 *  status='pending' as a safety guard: this can never touch an already-
 *  attached row even if called with a stale/wrong id) then makes a
 *  best-effort attempt to remove any object at that path from Storage.
 *  Since signing itself failed, no bytes were ever actually uploaded in
 *  the normal case — the Storage delete is defensive, not expected to
 *  find anything. Never throws to the caller; logs by status/error only,
 *  never the path. */
export async function deletePendingAttachment(params: {
  attachmentId: string;
  storagePath: string;
}): Promise<void> {
  const res = await fetch(
    `${BASE}/rest/v1/message_attachments?id=eq.${encodeURIComponent(params.attachmentId)}&status=eq.pending`,
    { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
  );
  if (!res.ok) {
    console.error("[messages] deletePendingAttachment: failed to delete row, status", res.status);
    return;
  }

  try {
    const storageRes = await fetch(`${BASE}/storage/v1/object/${MESSAGE_ATTACHMENTS_BUCKET}`, {
      method:  "DELETE",
      headers: h(),
      body:    JSON.stringify({ prefixes: [params.storagePath] }),
    });
    if (!storageRes.ok) {
      console.error("[messages] deletePendingAttachment: storage cleanup failed, status", storageRes.status);
    }
  } catch (err) {
    console.error("[messages] deletePendingAttachment: storage cleanup threw", err);
  }
}

/** Full raw row lookup by id — server-internal only (includes
 *  storage_path). This is the ONLY function in this module that returns
 *  a raw MessageAttachment to a caller outside itself; the download
 *  route (Phase 3) is the sole consumer, and it never serializes this
 *  value back to the client — it uses storage_path purely to fetch the
 *  object server-side, then builds an ordinary file response. */
export async function getAttachmentByIdServer(attachmentId: string): Promise<MessageAttachment | null> {
  const res = await fetch(
    `${BASE}/rest/v1/message_attachments?id=eq.${encodeURIComponent(attachmentId)}&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: MessageAttachment[] = await res.json();
  return rows[0] ?? null;
}

export type AuthorizedAttachmentResult =
  | { ok: true; attachment: MessageAttachment }
  | { ok: false; status: number; error: string };

/** The shared attachment-authorization chain: attachment id -> attachment
 *  row -> its linked message -> that message's live thread_id
 *  (defense-in-depth cross-check against the RPC's own invariant) ->
 *  current actor's participation in that thread (isParticipant — the one
 *  real authorization gate, identical for every actor kind, no Platform
 *  Admin bypass). Used by BOTH the raw download route and the attachment
 *  viewer page, so the two can never drift on what counts as authorized.
 *  Every failure returns a generic 404 ("File not found.") — this never
 *  distinguishes "doesn't exist" from "exists but you're not authorized",
 *  matching the original download route's convention. Callers are still
 *  responsible for their own actor resolution and the separate 401 for a
 *  fully unauthenticated (kind: "public") caller — this function only
 *  ever receives an already-resolved ActorKey. */
export async function resolveAuthorizedAttachment(
  attachmentId: string,
  actorKey: ActorKey,
): Promise<AuthorizedAttachmentResult> {
  const attachment = await getAttachmentByIdServer(attachmentId);
  // A pending (unclaimed) attachment is never accessible — only a fully
  // attached one, with a real message_id, can be. A moderation-removed
  // attachment (Phase A40) is rejected the exact same way a pending one
  // is — this is the single chokepoint every attachment-serving route
  // shares (download route + viewer page, per this function's own header
  // comment), so an old URL/path can never still open a removed file
  // regardless of which route it was requested through.
  if (!attachment || attachment.status !== "attached" || !attachment.message_id || attachment.removed_at) {
    return { ok: false, status: 404, error: "File not found." };
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const msgRes = await fetch(
    `${BASE}/rest/v1/messages?id=eq.${encodeURIComponent(attachment.message_id)}&select=thread_id&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
  );
  const msgRows: { thread_id: string }[] = msgRes.ok ? await msgRes.json() : [];
  const messageThreadId = msgRows[0]?.thread_id ?? null;
  if (!messageThreadId || messageThreadId !== attachment.thread_id) {
    return { ok: false, status: 404, error: "File not found." };
  }

  const ok = await isParticipant(attachment.thread_id, actorKey);
  if (!ok) {
    return { ok: false, status: 404, error: "File not found." };
  }

  return { ok: true, attachment };
}

// ─── Canonical message preview (Phase 3) ───────────────────────────────────────
//
// One safe, logical "what should this message look like as a short
// preview string" rule, shared by every place that needs one: the
// web-push payload (sendPushToParticipants) and the thread's
// last_message_preview (updateThreadMeta). The in-app notifications row
// body and the native APNs alert (buildApnsAlert in apns.ts) are both
// already fixed, generic strings ("${actorName} sent you a message")
// regardless of content — neither needed, and neither gets, any
// attachment-aware change here. This never takes a filename as input —
// there is no code path by which a private filename could reach either
// consumer through this function. message.body itself is never touched
// by this — an attachment-only message's stored body stays exactly
// empty, as designed; this only affects what's shown as a PREVIEW
// elsewhere.

/** Pure. The fallback preview text for a message with NO text body —
 *  one or more attachments only. Never given (and never needs) a
 *  filename. */
export function attachmentOnlyMessagePreview(attachmentKinds: AttachmentKind[]): string {
  if (attachmentKinds.length > 1) return `📎 Sent ${attachmentKinds.length} attachments`;
  const kind = attachmentKinds[0];
  if (kind === "video") return "🎥 Sent a video";
  if (kind === "file")  return "📎 Sent a file";
  return "📷 Sent a photo"; // "image", and the fallback for an unexpected/empty kind
}

/** Pure. The canonical preview text for a message: the existing
 *  truncated-text behavior when there's a body (text + attachments still
 *  uses the text, never the attachment fallback), the attachment
 *  fallback above when the body is empty. Used for BOTH the web-push
 *  body and updateThreadMeta's last_message_preview, so the two can
 *  never drift on what a given message "looks like" as a preview. */
export function messagePreview(body: string, attachmentKinds: AttachmentKind[]): string {
  const trimmed = body.trim();
  if (trimmed) return trimmed.slice(0, 100);
  return attachmentOnlyMessagePreview(attachmentKinds);
}

// ─── Safe Content-Disposition (Phase 3) ───────────────────────────────────────

/** Pure. Percent-encodes a filename for safe use inside an HTTP header
 *  value — encodeURIComponent already escapes CR/LF and quote
 *  characters, which is what actually prevents header injection/
 *  malformed values; the %20->+ swap is purely cosmetic (matches the
 *  existing team-files download route's pattern). */
export function safeContentDispositionFilename(filename: string): string {
  return encodeURIComponent(filename).replace(/%20/g, "+");
}

/** Pure. Full Content-Disposition header value for an attachment
 *  download — same "<disposition>; filename=...; filename*=UTF-8''..."
 *  shape already used by api/team/[slug]/files/[id]/route.ts.
 *
 *  `disposition` defaults to "attachment" (forces a download — the
 *  correct fallback for DOC/DOCX, which nothing in this app can render
 *  inline). Callers pass "inline" explicitly for images, video, and PDF
 *  — see attachmentDownloadDisposition — so an <img>/<video>/<iframe>
 *  pointed at the download route reliably renders/plays in place:
 *  "attachment" is a top-level-navigation download hint and isn't
 *  something every browser/WebView is guaranteed to still decode as an
 *  embeddable resource, whereas "inline" is unambiguous either way and
 *  simply becomes a download when the same URL is opened as a top-level
 *  navigation with no renderer for it (unchanged DOC/DOCX click
 *  behavior). This never introduces a public or signed-download URL — it
 *  only changes one response header on the same authenticated,
 *  participant-gated route. */
export function buildAttachmentContentDisposition(
  filename: string,
  disposition: "inline" | "attachment" = "attachment",
): string {
  const safe = safeContentDispositionFilename(filename);
  return `${disposition}; filename="${safe}"; filename*=UTF-8''${safe}`;
}

/** Pure. The Content-Disposition mode for a given attachment's download —
 *  "inline" lets the browser/WebView render or play it in place (needed
 *  for the <img>/<video>/<iframe>-based viewer and inline thread
 *  previews); "attachment" forces a save prompt. Images and video are
 *  always inline (video needs this for <video> playback, not just
 *  scrubbing — many browsers refuse to play a video element whose source
 *  is served as a forced download). PDF is inline too, so both the
 *  desktop-web new-tab preview and the native in-viewer <iframe> render
 *  it directly instead of downloading. Everything else (DOC/DOCX) stays
 *  "attachment" — nothing in this app can render those inline, and nothing
 *  about this change is meant to alter that. Keyed by MIME type, not
 *  attachment_kind alone, since "file" covers both PDF (renderable) and
 *  DOC/DOCX (not). */
export function attachmentDownloadDisposition(
  mimeType: string,
  attachmentKind: AttachmentKind,
): "inline" | "attachment" {
  if (attachmentKind === "image") return "inline";
  if (attachmentKind === "video") return "inline";
  if (mimeType === "application/pdf") return "inline";
  return "attachment";
}

// ─── Safe Range-header passthrough (Phase: native attachment viewer) ──────────

// Matches a single, well-formed byte-range spec only — "bytes=N-",
// "bytes=N-M", or "bytes=-N". Deliberately does not attempt to validate
// the numbers against the actual object size; Supabase Storage's own
// GET-object endpoint is the authority on whether a given range is
// actually satisfiable (it replies 416 if not), exactly like it already
// is for every other GET this route makes.
const SINGLE_BYTE_RANGE_RE = /^bytes=\d*-\d*$/;

/** Pure. Whether an incoming Range header value is safe to forward
 *  verbatim to Supabase Storage. Rejects multi-range values
 *  ("bytes=0-10,20-30" — Storage's single-part response wouldn't match
 *  what a multi-range request expects), anything malformed, absent
 *  values, and the syntactically-matching-but-meaningless "bytes=-" (no
 *  start, no end). A rejected value simply means the caller falls back
 *  to serving the full object with a normal 200 — always a safe degrade,
 *  never a security or correctness issue, just no partial-content
 *  optimization for that one request. */
export function isForwardableRangeHeader(value: string | null): value is string {
  if (!value) return false;
  if (value === "bytes=-") return false;
  return SINGLE_BYTE_RANGE_RE.test(value);
}

export type SendMessageWithAttachmentsResult =
  | { ok: true; message: { id: string; created_at: string } }
  | { ok: false; error: string };

/** Thin wrapper around the send_message_with_attachments Postgres RPC
 *  (supabase/migrations/phase_a31_message_attachments.sql) — the sole
 *  transactional authority for attachment thread/status/uploader
 *  verification and the message+claim atomicity. This function
 *  deliberately does NOT re-implement any of that verification in
 *  TypeScript; it only shapes the request and surfaces failure. Callers
 *  (API routes) are still responsible for isParticipant(threadId,
 *  actorKey) authorization BEFORE calling this — the RPC has no way to
 *  know whether the caller is actually a participant of the thread. */
export async function sendMessageWithAttachments(params: {
  threadId: string;
  actor: ActorKey;
  senderName: string;
  senderRole: string;
  body: string;
  attachmentIds: string[];
}): Promise<SendMessageWithAttachmentsResult> {
  const senderColumns = actorIdColumns(params.actor);
  const res = await fetch(`${BASE}/rest/v1/rpc/send_message_with_attachments`, {
    method:  "POST",
    headers: h(),
    body:    JSON.stringify({
      p_thread_id:                params.threadId,
      p_sender_type:              params.actor.kind,
      p_sender_coach_id:          senderColumns.coach_id,
      p_sender_member_id:         senderColumns.member_id,
      p_sender_platform_admin_id: senderColumns.platform_admin_id,
      p_sender_name: params.senderName,
      p_sender_role: params.senderRole,
      p_body:        params.body,
      p_attachment_ids: params.attachmentIds,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("[messages] sendMessageWithAttachments RPC failed:", res.status, detail);
    return { ok: false, error: "Failed to send message." };
  }

  // A function RETURNS-ing a single row (not SETOF) comes back from
  // PostgREST as one JSON object, not an array.
  const row: { id: string; created_at: string } = await res.json();
  return { ok: true, message: { id: row.id, created_at: row.created_at } };
}

// ─── Canonical thread resolve/create (Phase 2 extraction) ─────────────────────
//
// Extracted from api/team/[slug]/messages/threads/route.ts's POST handler
// so the future /threads/resolve endpoint (attachment-only new-thread
// flow — see the approved design) and the existing text-only POST route
// can share EXACTLY the same recipient validation, family auto-inclusion,
// Head Coach oversight, canonical-reuse, and participant sync/top-up
// logic, with zero risk of the two diverging over time. This function
// NEVER inserts a message — that stays the caller's responsibility, so it
// works identically whether a message already has a body in hand (the
// existing route) or not yet (the future resolve-only endpoint).
export type ResolveOrCreateThreadOutcome =
  | { ok: true; thread: MessageThread; reused: boolean }
  | { ok: false; error: string; status: number };

export async function resolveOrCreateThreadForRecipient(params: {
  slug: string;
  actor: ActorKey;
  actorName: string;
  actorRole: string;
  /** Head-coach-equivalent authority — true for a real head_coach OR a
   *  platform admin (who never needs Head Coach oversight added to their
   *  own threads any more than a real head coach does). Computed by the
   *  caller from the full TeamActor, since this module only knows
   *  ActorKey and deliberately has no dependency on permissions.ts. */
  actorIsHeadCoach: boolean;
  recipientActorType: "coach" | "member";
  recipientId: string;
  /** Set on the newly-CREATED thread row's last_message_preview at
   *  creation time — pass the trimmed message body when the caller
   *  already has one (the existing route, preserving its exact current
   *  behavior of setting the preview atomically with thread creation),
   *  or null when no message exists yet (a future resolve-only caller;
   *  the preview is then fixed up later by the normal updateThreadMeta
   *  call once a message is actually sent into the thread). Has no
   *  effect on the reuse path, which always re-asserts the preview via
   *  updateThreadMeta after the caller inserts its message, exactly as
   *  before this extraction. */
  initialPreview: string | null;
}): Promise<ResolveOrCreateThreadOutcome> {
  const { slug, actor, actorName, actorRole, actorIsHeadCoach, recipientActorType, recipientId, initialPreview } = params;

  // Members (athlete/parent/booster) can only initiate threads with coaches.
  if (actor.kind === "member" && recipientActorType !== "coach") {
    return { ok: false, error: "Members can only start conversations with coaches.", status: 403 };
  }

  // Validate recipient exists in this campaign.
  const recipientCoach = recipientActorType === "coach" ? await fetchCoachById(recipientId, slug) : null;
  const recipientMember = recipientActorType === "member" ? await fetchMemberById(recipientId, slug) : null;
  if (!recipientCoach && !recipientMember) {
    return { ok: false, error: "Recipient not found.", status: 404 };
  }

  // Phase A37 (interpersonal blocking): checked here, and ONLY here in
  // the entire messaging pipeline — this function is the single
  // chokepoint both the text-message POST route and the attachment-first
  // /threads/resolve route already share (see the extraction note
  // above), so a block applies uniformly to starting a new thread AND to
  // reusing/continuing an existing one, in either direction. Deliberately
  // NOT consulted anywhere in the announcement pipeline (getAnnouncements,
  // isAnnouncementVisibleToActor, or push dispatch) — a block must never
  // suppress official team communications, only this interpersonal path.
  const { isBlockedEitherDirection } = await import("./moderation/blocks.ts");
  const blocked = await isBlockedEitherDirection(slug, actor, { kind: recipientActorType, id: recipientId });
  if (blocked) {
    return { ok: false, error: "You can't message this person right now.", status: 403 };
  }

  // Build participant list (deduped by actor key)
  const seen = new Set<string>();
  const participants: Omit<ParticipantInsert, "thread_id">[] = [];

  function addParticipant(
    actor_type: "coach" | "member" | "platform_admin",
    id: string,
    is_auto_included: boolean,
    is_observer: boolean,
  ) {
    const key = `${actor_type}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    participants.push({
      actor_type,
      coach_id:          actor_type === "coach"          ? id : null,
      member_id:         actor_type === "member"         ? id : null,
      platform_admin_id: actor_type === "platform_admin" ? id : null,
      is_auto_included,
      is_observer,
    });
  }

  // Creator
  addParticipant(actor.kind, actor.id, false, false);

  // Explicit recipient
  addParticipant(recipientActorType, recipientId, false, false);

  // Family auto-include (athlete <-> parent) — canonical, symmetric in
  // both directions. Seeds from whichever side(s) of this thread are
  // members: the actor (covers athlete->coach, parent->coach) and the
  // explicit recipient (covers coach->athlete, coach->parent).
  const familySeedIds: string[] = [];
  if (actor.kind === "member") familySeedIds.push(actor.id);
  if (recipientMember) familySeedIds.push(recipientMember.id);
  const familyParticipants = await resolveRequiredFamilyParticipants(familySeedIds, slug);
  for (const fp of familyParticipants) {
    if (fp.member_id) addParticipant("member", fp.member_id, true, false);
  }

  // Head coach oversight condition: add if thread has athlete/parent OR
  // actor does not already carry head-coach-equivalent authority.
  const hasAthleteOrParent = participants.some(p => {
    if (p.actor_type !== "member") return false;
    const id = p.member_id!;
    return id === recipientId
      ? ["athlete", "parent"].includes(recipientMember?.role ?? "")
      : true;
  });
  const needsOversight = hasAthleteOrParent || !actorIsHeadCoach;
  const headCoaches = needsOversight ? await fetchHeadCoaches(slug) : [];

  // Canonical conversation reuse (Phase 2B): `participants` at this point
  // is exactly the desired NON-OBSERVER set — oversight hasn't been added
  // yet, so observers are excluded from the identity check by
  // construction, not by a filter.
  const desiredNonObserver: ParticipantRef[] = participants.map(p => ({
    actor_type: p.actor_type, coach_id: p.coach_id, member_id: p.member_id, platform_admin_id: p.platform_admin_id,
  }));
  const existingThread = await findCanonicalExistingThread(slug, actor, desiredNonObserver);

  if (existingThread) {
    // Reuse: sync family (defensive — the match already requires an exact
    // current-state match, but cheap and correct to re-assert) and top up
    // any missing oversight. No new thread row, no participant
    // duplication.
    try {
      await syncRequiredThreadParticipants(existingThread.id, slug);
      if (headCoaches.length) {
        await ensureHeadCoachOversight(existingThread.id, headCoaches.map(hc => hc.id));
      }
    } catch {
      return { ok: false, error: "Unable to send message right now. Please try again.", status: 500 };
    }
    return { ok: true, thread: existingThread, reused: true };
  }

  for (const hc of headCoaches) addParticipant("coach", hc.id, true, true);

  // Create thread — always subjectless going forward (Phase 2B).
  const threadRes = await fetch(`${BASE}/rest/v1/message_threads`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify({
      campaign_slug:                 slug,
      subject:                       null,
      created_by_type:               actor.kind,
      created_by_coach_id:           actor.kind === "coach"          ? actor.id : null,
      created_by_member_id:          actor.kind === "member"         ? actor.id : null,
      created_by_platform_admin_id:  actor.kind === "platform_admin" ? actor.id : null,
      creator_name:         actorName,
      creator_role:         actorRole,
      last_message_preview: initialPreview,
    }),
  });
  if (!threadRes.ok) {
    return { ok: false, error: "Failed to create thread.", status: 500 };
  }
  const [thread] = await threadRes.json();

  // Insert participants. Must not silently create a thread that omits
  // required parents/oversight — fail cleanly instead.
  const ptInserts: ParticipantInsert[] = participants.map(p => ({
    ...p,
    thread_id: thread.id,
  }));
  try {
    await insertParticipants(ptInserts);
  } catch {
    return { ok: false, error: "Failed to set up conversation participants. Please try again.", status: 500 };
  }

  return { ok: true, thread, reused: false };
}
