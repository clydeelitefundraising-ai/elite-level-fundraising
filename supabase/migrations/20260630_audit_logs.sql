-- Phase A7: Admin Audit Log
-- Run this in Supabase SQL Editor before deploying Phase A7.

CREATE TABLE IF NOT EXISTS audit_logs (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       timestamptz DEFAULT now() NOT NULL,
  admin_identifier text,
  action           text        NOT NULL,
  entity_type      text,
  entity_id        text,
  campaign_slug    text,
  summary          text,
  previous_value   jsonb,
  new_value        jsonb,
  ip_address       text,
  user_agent       text
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx    ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_campaign_slug_idx ON audit_logs (campaign_slug);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx        ON audit_logs (action);

-- Append-only: no RLS update/delete policies should ever be granted on this table.
-- Admin reads are via service role key only (server-side).
