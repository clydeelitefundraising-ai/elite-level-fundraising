-- Phase 7: Team Hub — Overview, Roster & Clearance
--
-- Two independent, additive changes:
--
-- 1. Booster Staff Visibility (display-only preference)
--    A boolean on campaign_settings controlling whether the Booster role
--    appears in Team -> Roster -> Staff. Deliberately NOT referenced by any
--    permission/authorization check anywhere in the app — it is read only
--    by the Staff-tab render filter. Turning it off does not touch the
--    Booster's role, access, or any other behavior.
--
-- 2. Clearance Resources
--    A new team resource/compliance library (title/description/link/
--    attachment). Attachment is an optional reference to the existing
--    team_files table (Phase 7 reuses that upload/storage architecture
--    unchanged — no new bucket). sort_order supports deterministic Head
--    Coach-controlled ordering without requiring drag-and-drop in this
--    phase. CHECK constraint enforces "title + at least one destination"
--    (url or attachment) at the DB level, matching this codebase's existing
--    pattern of DB-level backstops (see team_staff_invitations_active_uniq).
--
--    attachment_id uses ON DELETE RESTRICT, not SET NULL. This codebase has
--    a documented, reproduced bug class (see phase_3b2_announcement_comments.sql's
--    comment on announcement_comments_author_ref_chk / message_threads /
--    messages) where pairing a CHECK constraint with ON DELETE SET NULL on
--    the referencing column causes the SET NULL to fire as an UPDATE that
--    is itself subject to the table's own CHECK, aborting the delete with
--    an opaque check_violation instead of a clear foreign-key error.
--    clearance_resources_has_destination is exactly such a CHECK, so the
--    same trap applies here: an attachment-only resource (url IS NULL)
--    would have its attachment_id forced to NULL by SET NULL, violating
--    the CHECK and aborting whatever deleted the team_files row. RESTRICT
--    avoids the trap entirely by refusing the team_files delete outright
--    with a standard 23503 foreign_key_violation while it is still
--    referenced — never allowing clearance_resources to reach a
--    destination-less state, and never cascading a delete onto the
--    Clearance resource itself. Application code must explicitly clear or
--    repoint attachment_id (or delete the Clearance resource) before the
--    underlying team_files row can be removed; see
--    src/app/api/team/[slug]/files/[id]/route.ts (DELETE) for the planned
--    friendly-error handling of the resulting 23503.
--
-- No RLS — consistent with every other table in this schema, which relies
-- on app-level authorization (service-role-only REST access) rather than
-- Postgres RLS policies (see phase_a12_coach_crm.sql for the precedent).
--
-- Additive only; safe for existing teams. No existing table/column is
-- modified or dropped.

ALTER TABLE campaign_settings
  ADD COLUMN IF NOT EXISTS show_booster_in_staff_roster boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS clearance_resources (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug          text NOT NULL,
  title                  text NOT NULL,
  description            text,
  url                    text,
  attachment_id          uuid REFERENCES team_files(id) ON DELETE RESTRICT,
  sort_order             integer NOT NULL DEFAULT 0,
  created_by_account_id  uuid REFERENCES elf_accounts(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clearance_resources_has_destination
    CHECK (url IS NOT NULL OR attachment_id IS NOT NULL)
);

-- Clearance-tab listing: "resources for this campaign, in display order".
CREATE INDEX IF NOT EXISTS clearance_resources_campaign_slug_idx
  ON clearance_resources (campaign_slug, sort_order);
