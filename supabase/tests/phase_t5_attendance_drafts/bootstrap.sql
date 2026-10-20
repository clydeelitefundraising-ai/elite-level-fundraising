-- Disposable local stand-in for the production schema the Phase 5
-- attendance migration depends on (plus what phase_t2/phase_t3 need, so
-- the existing To-Do objects are applied first and proven unchanged).
-- Run as superuser. Column shapes match production (checked read-only).
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE supa_owner LOGIN;           -- stands in for Supabase's non-superuser "postgres"
ALTER SCHEMA public OWNER TO supa_owner;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Supabase-style default privileges: everything new is granted broadly.
ALTER DEFAULT PRIVILEGES FOR ROLE supa_owner IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supa_owner IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supa_owner IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

SET ROLE supa_owner;
CREATE TABLE public.elf_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, name text, created_at timestamptz DEFAULT now());
CREATE TABLE public.platform_admins (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL UNIQUE REFERENCES public.elf_accounts(id), role text, created_at timestamptz DEFAULT now());
CREATE TABLE public.campaign_settings (campaign_slug text PRIMARY KEY);
CREATE TABLE public.team_coaches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_slug text REFERENCES public.campaign_settings(campaign_slug), name text, email text, role text, created_at timestamptz DEFAULT now(), account_id uuid REFERENCES public.elf_accounts(id) ON DELETE SET NULL);
CREATE TABLE public.athletes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_slug text, name text NOT NULL, class_year text, created_at timestamptz DEFAULT now());
CREATE TABLE public.team_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_slug text, role text, name text, athlete_id uuid REFERENCES public.athletes(id) ON DELETE SET NULL, account_id uuid REFERENCES public.elf_accounts(id) ON DELETE SET NULL, created_at timestamptz DEFAULT now());
CREATE TABLE public.team_member_athletes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE, athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE, created_at timestamptz DEFAULT now());
CREATE TABLE public.team_files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_slug text, name text, storage_path text, file_type text, size_bytes bigint, uploaded_by text, coach_id uuid, created_at timestamptz DEFAULT now(), uploaded_by_platform_admin_id uuid REFERENCES public.platform_admins(id));
CREATE TABLE public.clearance_resources (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_slug text, title text, description text, url text, attachment_id uuid REFERENCES public.team_files(id), sort_order int, created_at timestamptz DEFAULT now());
ALTER TABLE public.elf_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_member_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clearance_resources ENABLE ROW LEVEL SECURITY;

-- ── Fixtures (ids: 00000000-0000-0000-0000-0000000000XX) ───────────────
INSERT INTO public.campaign_settings VALUES ('team-a'), ('team-b'), ('team-c'), ('team-empty');
INSERT INTO public.elf_accounts (id, email, name) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'head@x',   'Hana Head'),
  ('00000000-0000-0000-0000-0000000000a2', 'asst@x',   'Avi Assist'),
  ('00000000-0000-0000-0000-0000000000a3', 'boost@x',  'Bo Booster'),
  ('00000000-0000-0000-0000-0000000000a4', 'admin@x',  'Ada Admin'),
  ('00000000-0000-0000-0000-0000000000a5', 'other@x',  'Otto Other'),
  ('00000000-0000-0000-0000-0000000000a6', 'mboost@x', 'Mo Member');
INSERT INTO public.platform_admins (id, account_id, role) VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a4', 'platform_admin');
INSERT INTO public.team_coaches (id, campaign_slug, name, role, account_id) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'team-a',     'Hana Head',  'head_coach',      '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c2', 'team-a',     'Avi Assist', 'assistant_coach', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000c3', 'team-a',     'Bo Booster', 'booster',         '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000c4', 'team-b',     'Otto Other', 'head_coach',      '00000000-0000-0000-0000-0000000000a5'),
  ('00000000-0000-0000-0000-0000000000c5', 'team-a',     'Lee Legacy', 'head_coach',      NULL),
  ('00000000-0000-0000-0000-0000000000c6', 'team-c',     'Cam Third',  'head_coach',      NULL),
  ('00000000-0000-0000-0000-0000000000c7', 'team-empty', 'Em Empty',   'head_coach',      NULL);
INSERT INTO public.athletes (id, campaign_slug, name, class_year, created_at) VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'team-a', 'Ava Adams',  'Freshman',  '2026-01-01T12:00:00Z'),
  ('00000000-0000-0000-0000-0000000000b2', 'team-a', 'Ben Brown',  'Sophomore', '2026-01-01T12:00:00Z'),
  ('00000000-0000-0000-0000-0000000000b3', 'team-a', 'Cy Clark',   NULL,        '2026-01-01T12:00:00Z'),
  ('00000000-0000-0000-0000-0000000000b4', 'team-a', 'Dee Diaz',   'Senior',    '2026-01-01T12:00:00Z'),
  ('00000000-0000-0000-0000-0000000000b5', 'team-a', 'Eli Evans',  'Junior',    '2026-01-01T12:00:00Z'),
  ('00000000-0000-0000-0000-0000000000b9', 'team-b', 'Bea Bell',   'Junior',    '2026-01-01T12:00:00Z'),
  ('00000000-0000-0000-0000-0000000000ba', 'team-c', 'Cal Cole',   'Senior',    '2026-01-01T12:00:00Z');
INSERT INTO public.team_members (id, campaign_slug, role, name, athlete_id, account_id) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'team-a', 'booster', 'Mo Member', NULL, '00000000-0000-0000-0000-0000000000a6'),
  ('00000000-0000-0000-0000-0000000000d2', 'team-a', 'athlete', 'Ava Adams', '00000000-0000-0000-0000-0000000000b1', NULL);
INSERT INTO public.clearance_resources (campaign_slug, title, url, sort_order) VALUES ('team-a', 'Register My Athlete', 'https://example.com/r', 0);
RESET ROLE;
