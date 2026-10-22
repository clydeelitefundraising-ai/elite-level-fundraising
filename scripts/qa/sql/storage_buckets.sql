-- ELF storage buckets for QA, matching how the app uses each one:
--   private (served only through server routes with the server key, uploads
--   through signed URLs): message-attachments, team-files
--   public (the app stores and shows /storage/v1/object/public/... URLs):
--   athlete-photos, community-partner-logos, profile-photos, shop-images,
--   sponsor-logos, team-branding-logos, team-logos
-- No storage RLS policies are needed: every upload, read and delete in the
-- app uses the service-role key. Re-runnable; keeps an existing bucket and
-- only corrects its public/private setting.
BEGIN;
INSERT INTO storage.buckets (id, name, public) VALUES
  ('message-attachments',     'message-attachments',     false),
  ('team-files',              'team-files',              false),
  ('athlete-photos',          'athlete-photos',          true),
  ('community-partner-logos', 'community-partner-logos', true),
  ('profile-photos',          'profile-photos',          true),
  ('shop-images',             'shop-images',             true),
  ('sponsor-logos',           'sponsor-logos',           true),
  ('team-branding-logos',     'team-branding-logos',     true),
  ('team-logos',              'team-logos',              true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
COMMIT;
