// Post Likes / Thumbs-Up — Phase 11b.
//
// Deliberately no moderation/status column — reactions publish
// immediately for all 5 roles (Head Coach, Assistant Coach, Booster,
// Parent, Athlete), unlike comments. See the migration file's header
// comment for the polymorphic author-column rationale.

import { restList, restInsert, restDelete } from "./_client.ts";
import { validateAnnouncementForCampaign } from "./comments.ts";
import type { ActorKey } from "../messages.ts";

export type PostLikeRow = {
  id:               string;
  campaign_slug:    string;
  announcement_id:  string;
  author_type:      "coach" | "member";
  author_coach_id:  string | null;
  author_member_id: string | null;
  created_at:       string;
};

export type LikeStatus = { count: number; liked_by_me: boolean };

export type ToggleLikeResult =
  | { ok: true; status: LikeStatus; liked: boolean }
  | { ok: false; reason: "announcement_not_found" };

function actorFilter(actor: ActorKey): string {
  return actor.kind === "coach"
    ? `author_coach_id=eq.${encodeURIComponent(actor.id)}`
    : `author_member_id=eq.${encodeURIComponent(actor.id)}`;
}

export async function getLikeStatus(
  announcementId: string,
  campaignSlug:   string,
  actor:          ActorKey,
): Promise<LikeStatus> {
  const rows = await restList<{ id: string; author_coach_id: string | null; author_member_id: string | null }>(
    `post_likes?announcement_id=eq.${encodeURIComponent(announcementId)}` +
    `&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=id,author_coach_id,author_member_id`,
  );
  const likedByMe = rows.some(r =>
    actor.kind === "coach" ? r.author_coach_id === actor.id : r.author_member_id === actor.id,
  );
  return { count: rows.length, liked_by_me: likedByMe };
}

// Toggle: like if not already liked, unlike if already liked. Race-safe
// against a double-tap/double-submit via the DB's own partial unique
// indexes (post_likes_coach_unique / post_likes_member_unique) — a
// concurrent duplicate insert is rejected at the DB level and treated the
// same as "already liked" here (falls through to reporting the current,
// now-correct state) rather than surfacing a raw constraint error.
export async function toggleLike(
  announcementId: string,
  campaignSlug:   string,
  actor:          ActorKey,
): Promise<ToggleLikeResult> {
  const announcement = await validateAnnouncementForCampaign(announcementId, campaignSlug);
  if (!announcement) return { ok: false, reason: "announcement_not_found" };

  const existing = await restList<{ id: string }>(
    `post_likes?announcement_id=eq.${encodeURIComponent(announcementId)}` +
    `&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&${actorFilter(actor)}&select=id&limit=1`,
  );

  if (existing[0]) {
    try {
      await restDelete(`post_likes?id=eq.${encodeURIComponent(existing[0].id)}`);
    } catch (err) {
      console.error("[platform/postLikes] unlike failed:", err);
    }
  } else {
    try {
      await restInsert<PostLikeRow>("post_likes", {
        campaign_slug:    campaignSlug,
        announcement_id:  announcementId,
        author_type:      actor.kind,
        author_coach_id:  actor.kind === "coach"  ? actor.id : null,
        author_member_id: actor.kind === "member" ? actor.id : null,
      });
    } catch (err) {
      // Most likely a partial-unique-index collision from a concurrent
      // duplicate tap — not a real failure, just fall through to
      // re-reading the current (now-correct) status below.
      console.error("[platform/postLikes] like insert failed (possibly a race, non-fatal):", err);
    }
  }

  const status = await getLikeStatus(announcementId, campaignSlug, actor);
  return { ok: true, status, liked: status.liked_by_me };
}
