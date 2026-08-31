import { randomUUID } from "node:crypto";

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
};

export type MessageThread = {
  id: string;
  campaign_slug: string;
  subject: string | null;
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
  "id,thread_id,actor_type,coach_id,member_id,platform_admin_id,is_auto_included,is_observer," +
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
  const fk = fkColumn(actor.kind);
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

const MESSAGE_ROW_SELECT =
  "id,thread_id,sender_type,sender_coach_id,sender_member_id,sender_platform_admin_id,sender_name,sender_role,body,created_at," +
  `team_coaches!sender_coach_id(${COACH_INFO_SELECT}),team_members!sender_member_id(${MEMBER_INFO_SELECT}),` +
  ATTACHMENT_EMBED_SELECT;

// Shared by getMessagesForThread and getResolvedMessageById (Phase 3) so
// the two never drift on what a "resolved message" looks like.
function toResolvedMessage(r: RawMessage, readAt: string | null): ResolvedMessage {
  return {
    id: r.id,
    thread_id: r.thread_id,
    sender_type: r.sender_type as "coach" | "member" | "platform_admin",
    sender_coach_id: r.sender_coach_id,
    sender_member_id: r.sender_member_id,
    sender_platform_admin_id: r.sender_platform_admin_id,
    body: r.body,
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
    attachments: r.message_attachments ?? [],
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
    `&message_attachments.order=created_at.asc,id.asc` +
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
    `&message_attachments.order=created_at.asc,id.asc` +
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
    `?actor_type=eq.${actor.kind}&${fk}=eq.${encodeURIComponent(actor.id)}&select=thread_id`,
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

  return family.map(m => ({ actor_type: "member" as const, coach_id: null, member_id: m.id, platform_admin_id: null }));
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
    fetch(
      `${BASE}/rest/v1/message_threads?id=in.${inClause}` +
      `&campaign_slug=eq.${encodeURIComponent(slug)}` +
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
  // attached one, with a real message_id, can be.
  if (!attachment || attachment.status !== "attached" || !attachment.message_id) {
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
