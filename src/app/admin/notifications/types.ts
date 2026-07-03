export type NotificationChannel = "email" | "push" | "sms" | "internal";
export type NotificationStatus  = "queued" | "processing" | "sent" | "failed" | "cancelled";

export type NotificationRow = {
  id:             string;
  channel:        NotificationChannel;
  recipient_type: string;
  recipient_id:   string | null;
  email:          string | null;
  phone:          string | null;
  title:          string;
  body:           string;
  payload:        Record<string, unknown>;
  status:         NotificationStatus;
  attempts:       number;
  scheduled_for:  string;
  sent_at:        string | null;
  last_error:     string | null;
  created_at:     string;
};

export type QueueSummary = {
  queued:     number;
  processing: number;
  sent:       number;
  failed:     number;
  cancelled:  number;
};

export type NotificationsData = {
  queue:   NotificationRow[];
  summary: QueueSummary;
};
