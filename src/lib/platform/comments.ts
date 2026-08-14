// Phase 3B-2: Announcement Comments + Head Coach Moderation.
//
// Single-row-with-status-column design (pending/approved/declined),
// mirroring pending_athlete_requests (Phase 1B) — see the migration
// comment (phase_3b2_announcement_comments.sql) for the full rationale.
// Author identity/display reuses lib/messages.ts's canonical
// resolvePhotoUrl/RawCoachInfo/RawMemberInfo — the same embedded-select
// pattern already used for DM participants/messages and already reused
// once before (Phase 2B's directory/route.ts) — not a new photo resolver.

import { restList, restInsert, restUpdate, restDelete } from "./_client";
import {
  resolvePhotoUrl, fetchHeadCoaches,
  type ActorKey, type RawCoachInfo, type RawMemberInfo,
} from "@/lib/messages";

export type CommentStatus = "pending" | "approved" | "declined";

export type AnnouncementCommentRow = {
  id:                  string;
  campaign_slug:       string;
  announcement_id:     string;
  author_type:         "coach" | "member";
  author_coach_id:     string | null;
  author_member_id:    string | null;
  body:                string;
  status:              CommentStatus;
  decided_by_coach_id: string | null;
  decided_at:          string | null;
  created_at:          string;
  updated_at:          string;
};

type RawComment = AnnouncementCommentRow & {
  team_coaches:  RawCoachInfo  | null;
  team_members:  RawMemberInfo | null;
};

export type ResolvedComment = {
  id:               string;
  announcement_id:  string;
  body:             string;
  status:           CommentStatus;
  created_at:       string;
  is_own:           boolean;
  author_name:      string;
  author_role:      string;
  author_photo_url: string | null;
};

export type PendingCommentApproval = Omit<ResolvedComment, "is_own"> & {
  announcement_title: string;
};

const COACH_INFO_SELECT  = "name,role,elf_accounts!account_id(profile_photo_url)";
const MEMBER_INFO_SELECT = "name,role,athlete_id,athletes!athlete_id(profile_photo),elf_accounts!account_id(profile_photo_url)";
const COMMENT_SELECT =
  "id,campaign_slug,announcement_id,author_type,author_coach_id,author_member_id,body,status,decided_by_coach_id,decided_at,created_at,updated_at," +
  `team_coaches!author_coach_id(${COACH_INFO_SELECT}),team_members!author_member_id(${MEMBER_INFO_SELECT})`;

function resolveDisplay(raw: RawComment): Omit<ResolvedComment, "is_own"> {
  return {
    id:               raw.id,
    announcement_id:  raw.announcement_id,
    body:             raw.body,
    status:           raw.status,
    created_at:       raw.created_at,
    author_name:      raw.team_coaches?.name ?? raw.team_members?.name ?? "Unknown",
    author_role:      raw.team_coaches?.role ?? raw.team_members?.role ?? "",
    author_photo_url: resolvePhotoUrl(raw.team_coaches, raw.team_members),
  };
}

function isOwnComment(raw: { author_type: "coach" | "member"; author_coach_id: string | null; author_member_id: string | null }, actor: ActorKey): boolean {
  return raw.author_type === actor.kind &&
    (actor.kind === "coach" ? raw.author_coach_id === actor.id : raw.author_member_id === actor.id);
}

// Confirms an announcement exists AND belongs to the given campaign —
// same validate-before-trust pattern as validateAthleteForCampaign
// (Phase 1A/3A) — never trusts a client-supplied announcement_id blindly,
// and never allows an announcement from Campaign A to receive a comment
// attributed under Campaign B.
export async function validateAnnouncementForCampaign(
  announcementId: string,
  campaignSlug: string,
): Promise<{ id: string; title: string } | null> {
  const rows = await restList<{ id: string; title: string }>(
    `announcements?id=eq.${encodeURIComponent(announcementId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=id,title&limit=1`,
  );
  return rows[0] ?? null;
}

const MAX_COMMENT_LENGTH = 1000;

export type CreateCommentResult =
  | { ok: true;  comment: ResolvedComment; announcementTitle: string }
  | { ok: false; reason: "validation"; message: string }
  | { ok: false; reason: "announcement_not_found" };

// isHeadCoachAuthor is passed in (computed by the caller via
// isHeadCoach(actor)) rather than re-derived here — this service layer
// has no session/role-table knowledge of its own, matching every other
// platform/*.ts service.
export async function createComment(input: {
  campaignSlug:       string;
  announcementId:     string;
  actor:              ActorKey;
  isHeadCoachAuthor:  boolean;
  body:               string;
}): Promise<CreateCommentResult> {
  const body = input.body?.trim();
  if (!body) return { ok: false, reason: "validation", message: "Comment cannot be empty." };
  if (body.length > MAX_COMMENT_LENGTH) {
    return { ok: false, reason: "validation", message: `Comments must be ${MAX_COMMENT_LENGTH} characters or fewer.` };
  }

  const announcement = await validateAnnouncementForCampaign(input.announcementId, input.campaignSlug);
  if (!announcement) return { ok: false, reason: "announcement_not_found" };

  // Head-Coach-authored comments publish immediately — the author already
  // IS the sole moderator for this campaign, so requiring self-approval is
  // pure friction with no security benefit (explicit product decision).
  // Assistant Coach / Booster / Athlete / Parent always go to "pending"
  // regardless of what the client claims — isHeadCoachAuthor is computed
  // server-side by the caller from the resolved session, never trusted
  // from the request body.
  const now = input.isHeadCoachAuthor ? new Date().toISOString() : null;

  const payload: Record<string, unknown> = {
    campaign_slug:       input.campaignSlug,
    announcement_id:     input.announcementId,
    author_type:         input.actor.kind,
    author_coach_id:     input.actor.kind === "coach"  ? input.actor.id : null,
    author_member_id:    input.actor.kind === "member" ? input.actor.id : null,
    body,
    status:              input.isHeadCoachAuthor ? "approved" : "pending",
    decided_by_coach_id: input.isHeadCoachAuthor ? input.actor.id : null,
    decided_at:          now,
  };

  const rows = await restInsert<RawComment>(`announcement_comments?select=${COMMENT_SELECT}`, payload);
  const raw = rows[0];
  return { ok: true, comment: { ...resolveDisplay(raw), is_own: true }, announcementTitle: announcement.title };
}

// Every comment on this announcement, filtered to what THIS viewer may
// see: approved comments are visible to anyone who can view the
// announcement at all (this function's caller is already responsible for
// that outer gate — same as every other team-hub read); pending/declined
// comments are visible only to their own author or the Head Coach. A
// comment must never widen the announcement's own audience — this only
// ever narrows what a subset of announcement-viewers additionally see.
export async function getVisibleComments(
  announcementId: string,
  campaignSlug:   string,
  actor:          ActorKey,
  actorIsHeadCoach: boolean,
): Promise<ResolvedComment[]> {
  const rows = await restList<RawComment>(
    `announcement_comments?announcement_id=eq.${encodeURIComponent(announcementId)}` +
    `&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=${COMMENT_SELECT}&order=created_at.asc`,
  );
  return rows
    .map(r => ({ ...resolveDisplay(r), is_own: isOwnComment(r, actor) }))
    .filter(c => c.status === "approved" || c.is_own || actorIsHeadCoach);
}

// Head Coach moderation queue — pending only, across the whole campaign.
export async function getPendingCommentApprovals(campaignSlug: string): Promise<PendingCommentApproval[]> {
  const rows = await restList<RawComment & { announcements: { title: string } | null }>(
    `announcement_comments?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&status=eq.pending` +
    `&select=${COMMENT_SELECT},announcements!announcement_id(title)&order=created_at.asc`,
  );
  return rows.map(r => ({
    ...resolveDisplay(r),
    announcement_title: r.announcements?.title ?? "Untitled",
  }));
}

export async function getPendingCommentApprovalCount(campaignSlug: string): Promise<number> {
  const rows = await restList<{ id: string }>(
    `announcement_comments?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&status=eq.pending&select=id`,
  );
  return rows.length;
}

export type DecideCommentResult =
  | { ok: true;  comment: { id: string; status: CommentStatus } }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "already_decided" };

// Single atomic conditional UPDATE (WHERE status='pending') — the exact
// claim-before-mutate pattern already proven race-safe by
// declineRequest()/pending_athlete_requests (Phase 1B): only one of two
// concurrent approve/decline attempts on the same comment can ever match
// this WHERE clause and return a row; the other affects 0 rows and is
// reported as already_decided, never silently double-applied.
async function decide(
  commentId:         string,
  campaignSlug:      string,
  decidedByCoachId:  string,
  status:            "approved" | "declined",
): Promise<DecideCommentResult> {
  const rows = await restUpdate<AnnouncementCommentRow>(
    `announcement_comments?id=eq.${encodeURIComponent(commentId)}` +
    `&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&status=eq.pending`,
    {
      status,
      decided_by_coach_id: decidedByCoachId,
      decided_at:          new Date().toISOString(),
      updated_at:          new Date().toISOString(),
    },
  );
  if (!rows[0]) {
    const check = await restList<{ id: string }>(
      `announcement_comments?id=eq.${encodeURIComponent(commentId)}` +
      `&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=id&limit=1`,
    );
    return check[0] ? { ok: false, reason: "already_decided" } : { ok: false, reason: "not_found" };
  }
  return { ok: true, comment: { id: rows[0].id, status: rows[0].status } };
}

export function approveComment(commentId: string, campaignSlug: string, decidedByCoachId: string): Promise<DecideCommentResult> {
  return decide(commentId, campaignSlug, decidedByCoachId, "approved");
}

export function declineComment(commentId: string, campaignSlug: string, decidedByCoachId: string): Promise<DecideCommentResult> {
  return decide(commentId, campaignSlug, decidedByCoachId, "declined");
}

export type DeleteCommentResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "forbidden" };

// Conservative first version (explicit instruction — no editing at all):
// the author may delete their own comment in any status; the Head Coach
// may delete anyone's for moderation cleanup. Nobody else.
export async function deleteComment(
  commentId:        string,
  campaignSlug:      string,
  actor:            ActorKey,
  actorIsHeadCoach: boolean,
): Promise<DeleteCommentResult> {
  const rows = await restList<AnnouncementCommentRow>(
    `announcement_comments?id=eq.${encodeURIComponent(commentId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=*&limit=1`,
  );
  const existing = rows[0];
  if (!existing) return { ok: false, reason: "not_found" };

  if (!isOwnComment(existing, actor) && !actorIsHeadCoach) {
    return { ok: false, reason: "forbidden" };
  }

  await restDelete(`announcement_comments?id=eq.${encodeURIComponent(commentId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}`);
  return { ok: true };
}

// Fire-and-forget push to the Head Coach(es) of this campaign when a new
// comment needs moderation — reuses sendPushToParticipants() (already
// proven for DMs) and fetchHeadCoaches() (already proven for message
// oversight) rather than adding any new push infrastructure. Callers
// should invoke this outside the request/response critical path.
export async function notifyHeadCoachesOfPendingComment(
  campaignSlug: string,
  announcementTitle: string,
): Promise<void> {
  const { sendPushToParticipants } = await import("@/lib/push");
  const headCoaches = await fetchHeadCoaches(campaignSlug);
  if (!headCoaches.length) return;
  await sendPushToParticipants(
    campaignSlug,
    headCoaches.map(hc => ({ actor_type: "coach" as const, coach_id: hc.id, member_id: null })),
    "", // no sender to exclude — this isn't a reply-to-self case
    {
      title: "New comment awaiting approval",
      body:  `On "${announcementTitle}"`,
      url:   `/team/${campaignSlug}/requests`,
    },
  );
}
