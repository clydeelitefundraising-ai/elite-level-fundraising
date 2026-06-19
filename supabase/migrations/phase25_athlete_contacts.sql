-- Phase 25: Athlete contact fields
-- Coach-managed contact info stored on the roster entry.
ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text;
