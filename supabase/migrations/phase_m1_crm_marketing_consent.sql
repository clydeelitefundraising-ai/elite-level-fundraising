-- Marketing redesign M1: optional marketing-email consent on CRM contacts.
--
-- The public fundraising preview asks for a name and email to unlock a
-- fictional sample fundraiser, with a SEPARATE, optional, unchecked
-- "email me product updates" checkbox. These columns record that opt-in —
-- when it happened, the exact wording shown, and where — so consent is
-- auditable and never inferred from the lead itself.
--
-- Additive only: four nullable/defaulted columns, no data rewritten, no
-- constraint on existing rows. Every existing contact reads as "no consent
-- recorded" (false), which is the correct default. Nothing in the Team App
-- or admin reads these columns yet.
--
-- NOT APPLIED anywhere by this commit. Apply to QA (synthetic data) only
-- after explicit approval, then set MARKETING_PREVIEW_LEAD_GATE=on for that
-- environment; production requires its own separate approval.

ALTER TABLE coach_crm_contacts
  ADD COLUMN IF NOT EXISTS marketing_consent        boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_at     timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_consent_text   text,
  ADD COLUMN IF NOT EXISTS marketing_consent_source text;

-- A recorded opt-in always carries its timestamp and wording.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coach_crm_contacts_marketing_consent_complete'
  ) THEN
    ALTER TABLE coach_crm_contacts
      ADD CONSTRAINT coach_crm_contacts_marketing_consent_complete
      CHECK (NOT marketing_consent OR (marketing_consent_at IS NOT NULL AND marketing_consent_text IS NOT NULL));
  END IF;
END $$;
