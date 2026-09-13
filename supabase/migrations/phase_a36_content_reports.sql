-- Phase A36: Content/User Reporting (Apple Guideline 1.2 UGC safeguard).
--
-- One polymorphic table covers all five reportable target types
-- (announcement, comment, message, attachment, user) rather than five
-- separate tables — target_type + target_id (+ target_kind for the
-- "user" case, since a reported *person* lives in one of three different
-- tables depending on role) is enough to resolve what was reported.
--
-- No FK from target_id to the underlying content tables: the underlying
-- row lives in a different table depending on target_type, so a single
-- FK column can't reference all five. This mirrors the existing
-- trust-the-service-layer convention already used for
-- announcements.coach_id (no CHECK) and announcement_comments'
-- author_coach_id/author_member_id (documented in
-- phase_3b2_announcement_comments.sql as a deliberate choice) — the
-- service layer (src/lib/moderation/reports.ts) is the sole writer and
-- always validates the target exists in-campaign before inserting.
--
-- reporter_kind/reporter_id follow the same no-FK polymorphic pattern for
-- the same reason (a reporter can be a coach, member, or platform admin).
-- reporter_name is a durable snapshot (same convention as
-- announcement_comments.author_name) so a report stays legible even if
-- the reporter's own membership is later removed.
--
-- Reports are never resolved by the reporter — only a Head Coach
-- (own campaign) or Platform Admin (any campaign). Enforced in
-- application code (route.ts checks isHeadCoach()/isPlatformAdmin()
-- before ever calling resolveReport()), not by a DB role/RLS mechanism,
-- matching every other moderation action in this codebase.
--
-- Additive only; safe for existing teams. No existing table modified.

CREATE TABLE IF NOT EXISTS content_reports (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug                   text NOT NULL,
  target_type                     text NOT NULL CHECK (target_type IN ('announcement', 'comment', 'message', 'attachment', 'user')),
  target_id                       uuid NOT NULL,
  target_kind                     text CHECK (target_kind IN ('coach', 'member', 'platform_admin')),
  reporter_kind                   text NOT NULL CHECK (reporter_kind IN ('coach', 'member', 'platform_admin')),
  reporter_id                     uuid NOT NULL,
  reporter_name                   text NOT NULL,
  reason                          text NOT NULL CHECK (reason IN ('harassment', 'inappropriate_content', 'spam', 'safety_concern', 'impersonation', 'other')),
  details                         text,
  status                          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  resolved_by_kind                text CHECK (resolved_by_kind IN ('coach', 'platform_admin')),
  resolved_by_id                  uuid,
  resolution_note                 text,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  resolved_at                     timestamptz
);

-- target_kind is required exactly when target_type = 'user', and must stay
-- null otherwise (a reported announcement/comment/message/attachment has
-- no "kind" of its own — only a reported person does).
ALTER TABLE content_reports
  ADD CONSTRAINT content_reports_target_kind_chk
  CHECK ((target_type = 'user') = (target_kind IS NOT NULL));

-- Head Coach / Platform Admin moderation queue: "open reports for this
-- campaign", the single query both queues run.
CREATE INDEX IF NOT EXISTS content_reports_campaign_status_idx
  ON content_reports (campaign_slug, status);

-- "Reports I filed" / duplicate-report awareness (not enforced as a
-- uniqueness constraint — a user may legitimately report the same target
-- twice for different reasons, e.g. once for spam, later for harassment).
CREATE INDEX IF NOT EXISTS content_reports_target_idx
  ON content_reports (campaign_slug, target_type, target_id);
