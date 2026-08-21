-- Phase 10b: add 'request' to notifications.type
--
-- Closes the gap found while wiring Requests into Phase 10's native push
-- work: notifications.type is currently CHECK-constrained to exactly
-- ('announcement','file_upload','calendar_event','fundraiser','message')
-- (see phase27_messaging.sql, which named and defined the constraint
-- explicitly as notifications_type_check — confirmed the current, only,
-- and most recent definition of this constraint; nothing later renames or
-- replaces it). There is no 'request' value, so a new pending
-- athlete/parent request cannot create a canonical notifications row
-- without this migration.
--
-- Same DROP/ADD pattern phase27_messaging.sql itself used to add
-- 'message' originally — idempotent (IF EXISTS guard), safe to re-run.
--
-- Purely additive to the allowed value set: every existing row's `type`
-- is one of the five original values, all of which remain valid under
-- the expanded constraint, so no existing row can violate it and this
-- statement cannot fail against current data.

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('announcement','file_upload','calendar_event','fundraiser','message','request'));
