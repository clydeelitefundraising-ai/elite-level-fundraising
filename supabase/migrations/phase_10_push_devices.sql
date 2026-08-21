-- Phase 10: Native Push Notifications — device registration + preferences
--
-- Two independent, additive tables. Neither touches or duplicates the
-- existing push_subscriptions table (web-push/VAPID, per-team-scoped,
-- kept exactly as-is per explicit product decision) — push_devices is a
-- deliberately separate, account-level native (APNs/future FCM) device
-- registry.
--
-- 1. push_devices
--    Keyed on elf_accounts.id, not team_coaches.id/team_members.id —
--    those per-team role rows have an unreliably-populated account_id
--    (confirmed real gap during the Phase 7 staff-aggregation audit), and
--    a physical device belongs to the PERSON across every team/role they
--    have, not to one team membership.
--
--    UNIQUE (platform, device_token) is deliberately GLOBAL device-token
--    ownership, not scoped by account_id. This is what makes the
--    approved registration semantics possible: the app always registers
--    via an upsert keyed on this exact constraint
--    (on_conflict=platform,device_token, resolution=merge-duplicates)
--    that overwrites account_id along with active/last_seen_at on every
--    call. If the same physical device token was last registered under a
--    different ELF account (a fresh login on a device someone else was
--    previously signed into), the very next registration call
--    atomically transfers that row to the newly authenticated account —
--    the same physical device can never remain associated with two
--    accounts at once, which is the whole point: a device must never go
--    on delivering User A's pushes after User B logs into the same
--    installed app. A per-(account_id, device_token) constraint (the
--    earlier draft of this proposal, corrected before this migration)
--    would NOT have this property — it would let the same token attach
--    to multiple accounts simultaneously.
--
--    active + last_seen_at support the approved lifecycle: logout
--    deactivates ONLY the one device row matching the caller's own
--    account_id AND the device_token the client supplies (never trusting
--    the token alone — the server-derived account_id in that WHERE
--    clause is what makes a forged/guessed token for another account's
--    device a safe no-op) — every other device row for the same account
--    stays active, so multiple devices per account remain independently
--    functional. An invalid/unregistered APNs token response
--    (410/BadDeviceToken) sets active=false the same way, mirroring the
--    existing dispatchPush()'s stale-subscription cleanup pattern in
--    src/lib/push.ts exactly.
--
-- 2. push_preferences
--    Simple account-level, one row per account, four V1 categories,
--    default ON everywhere (per explicit product decision — no
--    per-team/per-device preference matrix in V1). Native iOS permission
--    state is enforced entirely on-device by Apple, independent of this
--    table — a denied OS permission means no token is ever registered
--    here in the first place, so this table only ever governs in-app
--    category opt-outs for a device that IS registered.
--
-- No RLS — consistent with every other table in this schema, which
-- relies on app-level authorization (service-role-only REST access)
-- rather than Postgres RLS policies.
--
-- Additive only; safe for existing teams/accounts. No existing
-- table/column is modified or dropped. Both tables start empty — no
-- data migration or backfill.

CREATE TABLE IF NOT EXISTS push_devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES elf_accounts(id) ON DELETE CASCADE,
  platform     text NOT NULL CHECK (platform IN ('ios', 'android')),
  device_token text NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, device_token)
);

-- Dispatch-time lookup: "every active device for this account" — the
-- partial index only covers the rows push fan-out ever actually queries.
CREATE INDEX IF NOT EXISTS push_devices_account_active_idx
  ON push_devices (account_id)
  WHERE active;

CREATE TABLE IF NOT EXISTS push_preferences (
  account_id   uuid PRIMARY KEY REFERENCES elf_accounts(id) ON DELETE CASCADE,
  team_updates boolean NOT NULL DEFAULT true,
  messages     boolean NOT NULL DEFAULT true,
  calendar     boolean NOT NULL DEFAULT true,
  requests     boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
