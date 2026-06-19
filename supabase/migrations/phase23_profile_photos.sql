-- Phase 23: Account profile photos
-- Must be run before deploying Phase 23 code.
ALTER TABLE elf_accounts
  ADD COLUMN IF NOT EXISTS profile_photo_url text;
