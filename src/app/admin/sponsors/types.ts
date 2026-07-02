export type {
  SponsorStatus, SponsorActivityType, SponsorBusiness, SponsorActivity, SponsorRelationship,
} from "@/lib/platform/sponsors";
export { SPONSOR_STATUSES, SPONSOR_ACTIVITY_TYPES } from "@/lib/platform/sponsors";
import type { SponsorStatus, SponsorBusiness, SponsorActivity } from "@/lib/platform/sponsors";

export const SPONSOR_STATUS_LABELS: Record<SponsorStatus, string> = {
  prospect:  "Prospect",
  contacted: "Contacted",
  active:    "Active",
  recurring: "Recurring",
  paused:    "Paused",
  lost:      "Lost",
};

export type SponsorPageSummary = {
  totalBusinesses:            number;
  activeSponsors:             number;
  recurringSponsors:          number;
  prospectSponsors:           number;
  estimatedAnnualBudgetCents: number;
  lifetimeValueCents:         number;
  renewalsDue:                number;
};

export type SponsorDirectoryData = {
  sponsors:       SponsorBusiness[];
  summary:        SponsorPageSummary;
  renewalsDue:    SponsorBusiness[];
  recentActivity: SponsorActivity[];
};
