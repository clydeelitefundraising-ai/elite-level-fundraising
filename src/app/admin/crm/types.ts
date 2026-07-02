export type CrmStatus =
  | "prospect"
  | "contacted"
  | "demo_scheduled"
  | "proposal_sent"
  | "signed"
  | "active"
  | "returning"
  | "lost";

export const CRM_STATUSES: CrmStatus[] = [
  "prospect", "contacted", "demo_scheduled", "proposal_sent", "signed", "active", "returning", "lost",
];

export const CRM_STATUS_LABELS: Record<CrmStatus, string> = {
  prospect:        "Prospect",
  contacted:       "Contacted",
  demo_scheduled:  "Demo Scheduled",
  proposal_sent:   "Proposal Sent",
  signed:          "Signed",
  active:          "Active",
  returning:       "Returning",
  lost:            "Lost",
};

export type CrmActivityType =
  | "note" | "call" | "email" | "text" | "demo" | "proposal" | "follow_up" | "status_change";

export const CRM_ACTIVITY_TYPES: CrmActivityType[] = [
  "note", "call", "email", "text", "demo", "proposal", "follow_up", "status_change",
];

export type CrmContact = {
  id:                  string;
  name:                string;
  email:               string | null;
  phone:               string | null;
  school_name:         string | null;
  sport:               string | null;
  city:                string | null;
  state:               string | null;
  status:              CrmStatus;
  source:              string | null;
  estimated_value:     number | null;
  expected_close_date: string | null;
  last_contacted_at:   string | null;
  next_follow_up_at:   string | null;
  notes:               string | null;
  created_at:          string;
  updated_at:          string;
};

export type CrmActivity = {
  id:            string;
  contact_id:    string;
  activity_type: CrmActivityType;
  title:         string;
  body:          string | null;
  activity_at:   string;
  created_at:    string;
};

export type CrmSummary = {
  totalContacts:      number;
  openProspects:      number;
  demosScheduled:     number;
  proposalsSent:      number;
  signedActive:       number;
  estimatedPipeline:  number;
  followUpsDue:       number;
};

export type CrmData = {
  contacts:        CrmContact[];
  summary:         CrmSummary;
  pipeline:        Record<CrmStatus, CrmContact[]>;
  followUpsDue:    CrmContact[];
  recentActivity:  CrmActivity[];
};
