-- Phase A18A: Notification Delivery Platform
--
-- Infrastructure only. Creates the durable outbox that future email, push,
-- SMS, and internal notifications will all be queued into. This migration
-- does not send anything — platform/notifications.ts only queues rows, and
-- platform/notificationJobs.ts drains them on demand.

CREATE TABLE IF NOT EXISTS notification_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel        text NOT NULL CHECK (channel IN ('email','push','sms','internal')),
  recipient_type text NOT NULL,
  recipient_id   uuid,
  email          text,
  phone          text,
  title          text NOT NULL,
  body           text NOT NULL,
  payload        jsonb NOT NULL DEFAULT '{}',
  status         text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','sent','failed','cancelled')),
  attempts       integer NOT NULL DEFAULT 0,
  scheduled_for  timestamptz NOT NULL DEFAULT now(),
  sent_at        timestamptz,
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_queue_status_idx        ON notification_queue (status);
CREATE INDEX IF NOT EXISTS notification_queue_channel_idx       ON notification_queue (channel);
CREATE INDEX IF NOT EXISTS notification_queue_scheduled_for_idx ON notification_queue (scheduled_for);
CREATE INDEX IF NOT EXISTS notification_queue_recipient_id_idx  ON notification_queue (recipient_id);
