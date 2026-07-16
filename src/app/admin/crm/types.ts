export type {
  CrmStatus, CrmActivityType, CrmContact, CrmActivity,
} from "@/lib/platform/crm";
export { CRM_STATUSES, CRM_ACTIVITY_TYPES } from "@/lib/platform/crm";
import type { CrmStatus, CrmContact, CrmActivity } from "@/lib/platform/crm";

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
  contacts:          CrmContact[];
  summary:           CrmSummary;
  pipeline:          Record<CrmStatus, CrmContact[]>;
  followUpsDue:      CrmContact[];
  recentActivity:    CrmActivity[];
  // contact_id -> campaign_slug, for contacts that have already launched a campaign.
  launchedCampaigns: Record<string, string>;
};

export type { DemoRequest, DemoRequestStatus } from "@/lib/platform/marketingDemoRequests";

// Contacts eligible for Launch Campaign — declared order in CRM_STATUSES
// ("prospect","contacted","demo_scheduled","proposal_sent","signed","active","returning","lost")
// confirms "active" genuinely comes after "signed", not just assumed.
export const LAUNCHABLE_STATUSES: CrmStatus[] = ["signed", "active"];
