-- Phase A29: Platform Administration — schema foundation
-- Run this in Supabase SQL Editor before deploying Phase A29.
-- Additive only: no existing column is altered or dropped, no existing row
-- changes behavior. Safe to run against production; nothing in the app reads
-- these new columns/tables until the Phase A29 application code ships.

-- ── 1. Link teams to their school ───────────────────────────────────────────
-- `organizations` (Phase A8) already models a school (address, AD contact,
-- branding). It was seeded with a single 'default' row because ELF only had
-- one school at the time. campaign_settings has no FK to it yet — this adds
-- one. Existing campaigns get organization_id = NULL and are fully
-- unaffected until backfilled (see backfill script below, run manually
-- after confirming how many distinct schools actually exist today).
ALTER TABLE campaign_settings
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

CREATE INDEX IF NOT EXISTS campaign_settings_org_idx
  ON campaign_settings (organization_id);

-- ── 2. Platform admin roster ────────────────────────────────────────────────
-- Deliberately its own table rather than a column on elf_accounts: keeps the
-- core account table untouched, keeps the permission check a simple
-- server-side existence lookup, and lets future employee tiers (support,
-- sales) be added as more rows/role values later without a schema rewrite.
CREATE TABLE IF NOT EXISTS platform_admins (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id  uuid        NOT NULL UNIQUE REFERENCES elf_accounts(id),
  role        text        NOT NULL DEFAULT 'platform_admin',
  created_at  timestamptz DEFAULT now() NOT NULL,
  created_by  uuid        REFERENCES elf_accounts(id)
);

CREATE INDEX IF NOT EXISTS platform_admins_account_idx ON platform_admins (account_id);

-- ── 3. Real actor attribution on audit_logs ─────────────────────────────────
-- audit_logs (Phase A7) has always written admin_identifier as the hardcoded
-- literal "admin" (see src/lib/auditLog.ts) — no entry today reflects who
-- actually performed an action. These columns are additive so existing rows
-- and existing callers keep working unchanged; the application-code phase
-- of A29 will start passing real actor_type/actor_id/actor_email for both
-- new platform-admin actions and (as a fix) existing admin-tool actions.
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_type  text,   -- 'admin_tool' | 'platform_admin' | 'coach' (future)
  ADD COLUMN IF NOT EXISTS actor_id    uuid,
  ADD COLUMN IF NOT EXISTS actor_email text;

CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx ON audit_logs (actor_id);

-- Append-only table — no RLS update/delete policies should ever be granted.
-- Admin/platform-admin reads remain service-role-key only (server-side).
