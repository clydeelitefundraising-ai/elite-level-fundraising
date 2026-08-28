-- Phase A31: Message Attachments — schema/storage foundation only.
--
-- Adds message_attachments as a dedicated child table (never columns on
-- messages, never a reuse of team_files — see the approved design audit:
-- team_files is campaign/staff-scoped, this is thread-participant-scoped
-- and writable by any actor kind including athletes/parents).
--
-- Lifecycle: a row is created 'pending' (message_id NULL) at sign-time,
-- before any message exists, then claimed 'attached' (message_id set)
-- atomically by send_message_with_attachments() below — never by a
-- separate, non-transactional UPDATE from application code. This is what
-- makes it impossible for a Realtime subscriber (or any other reader) to
-- ever observe a message whose attachments aren't already linked: no
-- reader can see the INSERT into messages until the same transaction's
-- UPDATE into message_attachments has also committed.
--
-- No TypeScript/API/UI/realtime work is included in this migration —
-- Phase 1 is schema/storage/RPC only, per the approved phased plan.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. message_attachments
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS message_attachments (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id                   uuid        NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  message_id                  uuid        REFERENCES messages(id) ON DELETE CASCADE,
  status                      text        NOT NULL DEFAULT 'pending',
  uploader_actor_type         text        NOT NULL,
  uploader_coach_id           uuid        REFERENCES team_coaches(id)     ON DELETE CASCADE,
  uploader_member_id          uuid        REFERENCES team_members(id)    ON DELETE CASCADE,
  uploader_platform_admin_id  uuid        REFERENCES platform_admins(id) ON DELETE CASCADE,
  -- Server-generated only (never client-supplied) — see the sign endpoint
  -- design. UNIQUE makes a claimed/guessed path collision structurally
  -- impossible, on top of already being a random UUID-based key.
  storage_path                text        NOT NULL UNIQUE,
  original_filename           text        NOT NULL,
  mime_type                   text        NOT NULL,
  byte_size                   bigint      NOT NULL,
  attachment_kind             text        NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT message_attachments_status_check
    CHECK (status = ANY (ARRAY['pending', 'attached'])),

  CONSTRAINT message_attachments_kind_check
    CHECK (attachment_kind = ANY (ARRAY['image', 'video', 'file'])),

  CONSTRAINT message_attachments_byte_size_check
    CHECK (byte_size > 0),

  -- Same three-way exclusivity shape already used for
  -- messages.sender_*/message_reads.*/message_thread_participants.* —
  -- exactly one of the three uploader id columns may be set, matching
  -- uploader_actor_type.
  CONSTRAINT message_attachments_uploader_check
    CHECK (
      (uploader_actor_type = 'coach'          AND uploader_coach_id          IS NOT NULL AND uploader_member_id IS NULL AND uploader_platform_admin_id IS NULL) OR
      (uploader_actor_type = 'member'         AND uploader_member_id         IS NOT NULL AND uploader_coach_id  IS NULL AND uploader_platform_admin_id IS NULL) OR
      (uploader_actor_type = 'platform_admin' AND uploader_platform_admin_id IS NOT NULL AND uploader_coach_id  IS NULL AND uploader_member_id         IS NULL)
    ),

  -- pending <=> message_id IS NULL, attached <=> message_id IS NOT NULL.
  -- This is what makes "attached with no message" and "pending with a
  -- message" both structurally unrepresentable.
  CONSTRAINT message_attachments_status_message_check
    CHECK (
      (status = 'pending'  AND message_id IS NULL) OR
      (status = 'attached' AND message_id IS NOT NULL)
    )
);

-- Join performance: messages -> its attachments (the read-side embed).
CREATE INDEX IF NOT EXISTS message_attachments_message_id_idx
  ON message_attachments (message_id);

-- Write-side: the RPC's thread-scoped verification, and general
-- thread-scoped lookups.
CREATE INDEX IF NOT EXISTS message_attachments_thread_id_idx
  ON message_attachments (thread_id);

-- Partial index sized for exactly the stale-pending sweep query
-- (WHERE thread_id = $1 AND status = 'pending' AND created_at < ...),
-- run opportunistically by the sign endpoint (Phase 2) — not a
-- background job. Partial keeps it small: attached rows (the eventual
-- majority) are never in it.
CREATE INDEX IF NOT EXISTS message_attachments_pending_cleanup_idx
  ON message_attachments (thread_id, created_at)
  WHERE status = 'pending';

ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
-- No policies — consistent with messages/message_threads/
-- message_thread_participants/message_reads, all of which have RLS
-- enabled with zero policies. Every read/write in this codebase goes
-- through the service-role key, which bypasses RLS; anon/authenticated
-- are left with the same default-deny every sibling messaging table
-- already has. GRANTs are still required for service_role, since GRANT
-- and RLS are independent privilege layers (see phase_a30's
-- notification_platform_admin_reads for the identical pattern on a
-- brand-new table).
GRANT ALL ON TABLE message_attachments TO anon;
GRANT ALL ON TABLE message_attachments TO authenticated;
GRANT ALL ON TABLE message_attachments TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. messages.body — allow empty (attachment-only messages)
-- ═══════════════════════════════════════════════════════════════════════════

-- Existing constraint (unchanged since the original phase28 CREATE TABLE,
-- confirmed still live via supabase/baseline/schema.sql — neither
-- phase_3c nor phase_a30 touched it):
--   CONSTRAINT messages_body_check
--     CHECK ((length(trim(body)) > 0) AND (length(body) <= 3000))
--
-- The non-empty half of this is dropped so an attachment-only message
-- (body = '') is DB-valid. The 3000-char ceiling is kept exactly as-is.
-- body stays NOT NULL — callers (insertMessage() and
-- send_message_with_attachments() below) always pass an explicit string,
-- '' or otherwise, never omit it. "Non-empty body OR >=1 attachment" is
-- enforced above the DB, in the API routes and in this migration's RPC
-- (which requires >=1 attachment id outright) — a single CHECK on
-- messages alone cannot see message_attachments, so this is deliberately
-- an application/RPC-layer rule, not a cross-table constraint.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_body_check;
ALTER TABLE messages
  ADD CONSTRAINT messages_body_check
    CHECK (length(body) <= 3000);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. send_message_with_attachments — the one narrow transactional RPC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Used ONLY when a message carries >=1 attachment. A plain text message
-- (the overwhelming majority of traffic, and 100% of existing behavior)
-- keeps using the existing PostgREST insertMessage() path, untouched.
--
-- SECURITY BOUNDARY (do not remove this comment when this function is
-- ever modified): this function does NOT authorize the caller. It has no
-- idea whether the sender is actually a participant of p_thread_id — that
-- check (isParticipant(threadId, actorKey)) MUST happen in the API route,
-- using the authenticated TeamActor, BEFORE this function is ever called.
-- This function's only job is transactional integrity: proving the
-- supplied attachment ids are real, unclaimed, belong to this exact
-- thread, and were uploaded by this exact sender — and only inserting the
-- message if every one of them checks out, atomically with claiming them.
--
-- Not SECURITY DEFINER: it runs with the privileges of whatever role
-- calls it (service_role, via PostgREST's rpc/ endpoint), exactly like
-- every other write in this codebase already does — no privilege
-- escalation is needed or introduced.
CREATE OR REPLACE FUNCTION public.send_message_with_attachments(
  p_thread_id                 uuid,
  p_sender_type               text,
  p_sender_coach_id           uuid,
  p_sender_member_id          uuid,
  p_sender_platform_admin_id  uuid,
  p_sender_name               text,
  p_sender_role               text,
  p_body                      text,
  p_attachment_ids            uuid[]
)
RETURNS public.messages
LANGUAGE plpgsql
AS $$
DECLARE
  v_requested_count int;
  v_distinct_count  int;
  v_locked_count    int;
  v_valid_count     int;
  v_updated_count   int;
  v_message         public.messages;
BEGIN
  -- 1. body length (matches messages_body_check's remaining half; body
  --    may legitimately be NULL/empty here — that's the whole point).
  IF p_body IS NULL OR length(p_body) > 3000 THEN
    RAISE EXCEPTION 'send_message_with_attachments: body must be <= 3000 characters';
  END IF;

  -- 2. require at least one attachment id — this function is never the
  --    path for a plain text message.
  v_requested_count := COALESCE(array_length(p_attachment_ids, 1), 0);
  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'send_message_with_attachments: at least one attachment id is required';
  END IF;

  -- 3. reject duplicate ids in the supplied array outright — otherwise a
  --    duplicate could inflate v_requested_count relative to the number
  --    of distinct rows actually locked/verified below, letting a
  --    mismatched count silently pass.
  SELECT count(DISTINCT x) INTO v_distinct_count FROM unnest(p_attachment_ids) AS x;
  IF v_distinct_count <> v_requested_count THEN
    RAISE EXCEPTION 'send_message_with_attachments: duplicate attachment ids supplied';
  END IF;

  -- 4. lock every row identified by id, before checking anything about
  --    it, so no concurrent call can claim/mutate it out from under this
  --    one between the existence check and the validity check below.
  --    (FOR UPDATE cannot appear directly in an aggregate query, hence
  --    the CTE: the lock is taken inside it, the count happens outside.)
  WITH locked AS (
    SELECT id
    FROM public.message_attachments
    WHERE id = ANY(p_attachment_ids)
    FOR UPDATE
  )
  SELECT count(*) INTO v_locked_count FROM locked;

  IF v_locked_count <> v_requested_count THEN
    RAISE EXCEPTION 'send_message_with_attachments: one or more attachment ids do not exist';
  END IF;

  -- 5/6. of the now-locked rows, count how many actually satisfy every
  --      required condition: belongs to this thread, still pending,
  --      not yet linked to a message, and uploaded by exactly this
  --      sender (all three uploader id columns compared, so a coach
  --      cannot claim a member's upload or vice versa, and no actor can
  --      claim another actor of the same kind's upload).
  SELECT count(*) INTO v_valid_count
  FROM public.message_attachments
  WHERE id = ANY(p_attachment_ids)
    AND thread_id  = p_thread_id
    AND status     = 'pending'
    AND message_id IS NULL
    AND uploader_actor_type        = p_sender_type
    AND uploader_coach_id          IS NOT DISTINCT FROM p_sender_coach_id
    AND uploader_member_id         IS NOT DISTINCT FROM p_sender_member_id
    AND uploader_platform_admin_id IS NOT DISTINCT FROM p_sender_platform_admin_id;

  IF v_valid_count <> v_requested_count THEN
    RAISE EXCEPTION 'send_message_with_attachments: one or more attachments failed thread/status/ownership verification';
  END IF;

  -- 7. insert exactly one message row.
  INSERT INTO public.messages (
    thread_id, sender_type, sender_coach_id, sender_member_id, sender_platform_admin_id,
    sender_name, sender_role, body
  ) VALUES (
    p_thread_id, p_sender_type, p_sender_coach_id, p_sender_member_id, p_sender_platform_admin_id,
    p_sender_name, p_sender_role, p_body
  )
  RETURNING * INTO v_message;

  -- 8. claim exactly those attachment rows.
  UPDATE public.message_attachments
  SET message_id = v_message.id,
      status     = 'attached'
  WHERE id = ANY(p_attachment_ids);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- 9. defensive: the UPDATE's WHERE is a strict subset of what step 6
  --    already verified, so this should always equal v_requested_count.
  --    If it doesn't, something changed underneath the lock in a way
  --    this function didn't anticipate — fail loudly and roll back
  --    rather than silently return a message with a partial claim.
  IF v_updated_count <> v_requested_count THEN
    RAISE EXCEPTION
      'send_message_with_attachments: attachment claim affected % rows, expected %',
      v_updated_count, v_requested_count;
  END IF;

  -- 10. return the inserted message. Any RAISE above aborts this
  --     function's entire transaction — no messages row and no
  --     message_attachments update survive a failed call.
  RETURN v_message;
END;
$$;

-- Least privilege: functions are PUBLIC-executable by default in
-- Postgres, so PUBLIC's implicit grant is revoked below. That alone is
-- NOT sufficient in this database: Supabase provisions a database-level
-- ALTER DEFAULT PRIVILEGES rule that auto-grants EXECUTE on every newly
-- created function in the public schema directly to anon and
-- authenticated (in addition to service_role) at CREATE FUNCTION time —
-- a direct, named grant, not PUBLIC's entry, so revoking PUBLIC never
-- touches it. This was discovered in production (the first migration
-- run left anon/authenticated with EXECUTE despite the PUBLIC revoke)
-- and is why anon/authenticated are revoked explicitly below, by name,
-- rather than relying on the PUBLIC revoke alone. Only service_role —
-- the same role every other write in this codebase already uses
-- exclusively, via PostgREST's rpc/ endpoint — ends up with EXECUTE.
REVOKE ALL ON FUNCTION public.send_message_with_attachments(
  uuid, text, uuid, uuid, uuid, text, text, text, uuid[]
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_message_with_attachments(
  uuid, text, uuid, uuid, uuid, text, text, text, uuid[]
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_message_with_attachments(
  uuid, text, uuid, uuid, uuid, text, text, text, uuid[]
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.send_message_with_attachments(
  uuid, text, uuid, uuid, uuid, text, text, text, uuid[]
) TO service_role;
