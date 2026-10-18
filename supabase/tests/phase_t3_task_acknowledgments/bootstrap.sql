-- Disposable local stand-in for the production schema the Phase 3
-- migration depends on. Run as superuser. psql var :tm_rule = the
-- team_members.athlete_id ON DELETE rule under test (SET NULL | CASCADE).
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
CREATE TABLE public.athletes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_slug text, name text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE public.team_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_slug text, role text, name text, athlete_id uuid REFERENCES public.athletes(id) ON DELETE :tm_rule, account_id uuid REFERENCES public.elf_accounts(id) ON DELETE SET NULL, created_at timestamptz DEFAULT now());
CREATE TABLE public.team_member_athletes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE, athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE, created_at timestamptz DEFAULT now());
CREATE TABLE public.team_files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_slug text, name text, storage_path text, file_type text, size_bytes bigint, uploaded_by text, coach_id uuid, created_at timestamptz DEFAULT now(), uploaded_by_platform_admin_id uuid REFERENCES public.platform_admins(id));
CREATE TABLE public.clearance_resources (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_slug text, title text, description text, url text, attachment_id uuid REFERENCES public.team_files(id), sort_order int, created_at timestamptz DEFAULT now());
ALTER TABLE public.elf_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_member_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clearance_resources ENABLE ROW LEVEL SECURITY;
INSERT INTO public.campaign_settings VALUES ('team-a'), ('team-b');
INSERT INTO public.clearance_resources (campaign_slug, title, url, sort_order) VALUES ('team-a', 'Register My Athlete', 'https://example.com/r', 0);
RESET ROLE;
