-- Phase 5: bridge public marketing demo requests into the Coach CRM sales
-- pipeline, and durably link a launched campaign back to the CRM contact
-- that produced it.
--
-- NOTE: phase_a20_marketing_demo_requests.sql documented marketing_demo_requests
-- as having "no foreign keys in or out." The ADD COLUMN below adds an incoming
-- FK from coach_crm_contacts, which supersedes that guarantee by design — this
-- is the intended Phase 5 bridge, not an accidental regression of it. The part
-- of that original guarantee that matters operationally (the public, unauthenticated
-- POST /api/marketing/demo-request insert path can never fail because of this
-- or any other table's constraints) is preserved: an incoming FK only affects
-- DELETEs on marketing_demo_requests, never INSERTs, and ON DELETE SET NULL
-- below means even a delete never blocks or cascades unexpectedly.

-- 1. coach_crm_contacts -> marketing_demo_requests (which public form submission
--    this contact was converted from, if any).
ALTER TABLE coach_crm_contacts
  ADD COLUMN IF NOT EXISTS demo_request_id uuid REFERENCES marketing_demo_requests(id) ON DELETE SET NULL;

-- At most one CRM contact per demo request (authoritative duplicate-prevention
-- for Convert to Contact; app code also pre-checks for a friendly error message).
CREATE UNIQUE INDEX IF NOT EXISTS coach_crm_contacts_demo_request_id_key
  ON coach_crm_contacts (demo_request_id)
  WHERE demo_request_id IS NOT NULL;

-- 2. campaign_settings -> coach_crm_contacts (which CRM contact's Launch
--    Campaign action produced this campaign, if any).
ALTER TABLE campaign_settings
  ADD COLUMN IF NOT EXISTS crm_contact_id uuid REFERENCES coach_crm_contacts(id) ON DELETE SET NULL;

-- At most one campaign per CRM contact (authoritative duplicate-prevention for
-- Launch Campaign — written inside createCampaignCore's own campaign_settings
-- insert, not a separate best-effort update, so a campaign can never exist
-- without this link already in place).
CREATE UNIQUE INDEX IF NOT EXISTS campaign_settings_crm_contact_id_key
  ON campaign_settings (crm_contact_id)
  WHERE crm_contact_id IS NOT NULL;

-- ── Rollback ──────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS campaign_settings_crm_contact_id_key;
-- ALTER TABLE campaign_settings DROP COLUMN IF EXISTS crm_contact_id;
-- DROP INDEX IF EXISTS coach_crm_contacts_demo_request_id_key;
-- ALTER TABLE coach_crm_contacts DROP COLUMN IF EXISTS demo_request_id;
