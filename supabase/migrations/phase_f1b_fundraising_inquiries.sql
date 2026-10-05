-- Phase F1b: Fundraising Inquiries
--
-- Dedicated table for "Inquire About Fundraising" submissions from a team's
-- coaching staff when fundraising_enabled is currently false for their
-- campaign (see phase_f1a_fundraising_toggle.sql). Mirrors the existing
-- pending-request convention used by pending_athlete_requests (Phase 1B) /
-- parent_access_requests (Phase 11A): a small, decoupled table with a
-- status enum and a decided_by_account_id/decided_at resolution pair,
-- rather than any new coupling into campaign_settings or team_coaches.
--
-- requested_by_account_id intentionally has NO foreign key to elf_accounts.
-- Submission is restricted server-side (see the inquiry API route) to an
-- authenticated Head Coach or Assistant Coach, but a coach's identity may
-- still be resolved from the legacy team_coach cookie session (team_coaches.id),
-- which has no corresponding elf_accounts row — the same reason CoachSession
-- itself (src/lib/teamSession.ts) carries no account_id. Storing whichever id
-- resolved the request (team_coaches.id for a legacy session, elf_accounts.id
-- for an elf_session-backed one) is sufficient for this phase's purposes
-- (who to credit / contact) without forcing every legacy coach session
-- through an account migration first. decided_by_account_id, by contrast,
-- is always an ELF platform admin acting under their own elf_accounts
-- identity (see PlatformAdminActorSession) — the same shape
-- pending_athlete_requests.decided_by_account_id already uses — so it keeps
-- its FK.
--
-- Additive only; safe for existing teams. No existing table is modified.
-- NOT YET APPLIED — written for review only, per Phase F1b instructions.

CREATE TABLE IF NOT EXISTS fundraising_inquiries (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug          text NOT NULL,
  requested_by_account_id uuid NOT NULL,
  requested_by_role      text NOT NULL CHECK (requested_by_role IN ('head_coach', 'assistant_coach')),
  status                 text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'resolved')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  decided_by_account_id  uuid REFERENCES elf_accounts(id) ON DELETE SET NULL,
  decided_at             timestamptz
);

-- Admin inquiry queue listing (Phase F1d, not built yet): "inquiries for
-- this campaign".
CREATE INDEX IF NOT EXISTS fundraising_inquiries_campaign_slug_idx
  ON fundraising_inquiries (campaign_slug);

-- "Inquiries submitted by this requester" (used by the API route to render
-- the already-requested state without a second table scan convention).
CREATE INDEX IF NOT EXISTS fundraising_inquiries_requested_by_idx
  ON fundraising_inquiries (requested_by_account_id);

-- Prevents a second ACTIVE inquiry for the same campaign — the DB-level
-- backstop against a coach repeatedly clicking "Inquire About Fundraising"
-- (double-click / browser-retry / two different coaches on the same team
-- both submitting). "Active" is the full unresolved lifecycle, not just the
-- initial state: new -> contacted -> resolved, where both new AND contacted
-- represent a still-open inquiry that must block a second submission; only
-- once an inquiry reaches resolved may a later one be created. Scoped to
-- campaign_slug alone, not also to requested_by_account_id, matching the
-- product requirement verbatim: "must prevent accidental duplicate ACTIVE
-- inquiries for the same campaign" — one open inquiry per team at a time,
-- regardless of which coach opened it. The API route also checks this
-- before insert (returning the existing row instead of a 500 on constraint
-- violation), but this index is the authoritative guarantee, mirroring the
-- pending_athlete_requests_active_uniq pattern.
CREATE UNIQUE INDEX IF NOT EXISTS fundraising_inquiries_active_uniq
  ON fundraising_inquiries (campaign_slug)
  WHERE status IN ('new', 'contacted');
