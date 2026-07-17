import { restList } from "./_client";
import { getAllDonations, groupDonationsByCampaign, getCampaignProgress } from "./donations";

export type CampaignSummary = {
  campaign_slug: string;
  school_name:   string;
  sport_name:    string;
  season:        string;
  goal_cents:    number;
  deadline:      string;
  archived:      boolean;
  created_at:    string;
  logo_url:      string | null;
  team_photo:    string | null;
  location:      string | null;
};

const SUMMARY_SELECT =
  "campaign_slug,school_name,sport_name,season,goal_cents,deadline,archived,created_at,logo_url,team_photo,location";

// Every non-demo campaign with the field superset needed by Team Health,
// Operations, and Automation. Single source of truth for "what campaigns exist."
export async function getCampaignSummary(): Promise<CampaignSummary[]> {
  return restList<CampaignSummary>(
    `campaign_settings?is_demo=eq.false&select=${SUMMARY_SELECT}&order=school_name.asc&limit=500`,
  );
}

export async function getCampaign(slug: string): Promise<CampaignSummary | null> {
  const rows = await restList<CampaignSummary>(
    `campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}&select=${SUMMARY_SELECT}&limit=1`,
  );
  return rows[0] ?? null;
}

export async function campaignExists(slug: string): Promise<boolean> {
  const rows = await restList<{ campaign_slug: string }>(
    `campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}&select=campaign_slug&limit=1`,
  );
  return rows.length > 0;
}

// Targeted lookup for Launch Campaign's duplicate-prevention pre-check. The
// partial unique index on campaign_settings.crm_contact_id is the authoritative
// concurrency guard; this is only for a friendly response before attempting insert.
export async function getCampaignByCrmContactId(crmContactId: string): Promise<CampaignSummary | null> {
  const rows = await restList<CampaignSummary>(
    `campaign_settings?crm_contact_id=eq.${encodeURIComponent(crmContactId)}&select=${SUMMARY_SELECT}&limit=1`,
  );
  return rows[0] ?? null;
}

// Bulk contact_id -> campaign_slug map, for the CRM UI to show "View Campaign"
// instead of "Launch Campaign" without a per-contact query.
export type CrmLinkedCampaign = { crm_contact_id: string; campaign_slug: string };

export async function getCampaignsByCrmContact(): Promise<CrmLinkedCampaign[]> {
  return restList<CrmLinkedCampaign>(
    "campaign_settings?crm_contact_id=not.is.null&select=campaign_slug,crm_contact_id&limit=2000",
  );
}

export async function getCampaignMetrics(slug: string) {
  const [campaign, donations] = await Promise.all([getCampaign(slug), getAllDonations()]);
  if (!campaign) return null;
  const campDonations = donations.filter(d => d.campaign_slug === slug);
  return { campaign, ...getCampaignProgress(campDonations, campaign.goal_cents) };
}

export async function getUpcomingDeadlines(withinDays: number): Promise<CampaignSummary[]> {
  const campaigns = await getCampaignSummary();
  const now = Date.now();
  const cutoff = now + withinDays * 86400000;
  return campaigns.filter(c => {
    const t = new Date(c.deadline).getTime();
    return t >= now && t <= cutoff;
  });
}

// Coach invite links that haven't been activated yet. Lives here (rather than
// a dedicated coaches service) because it's only ever consumed as a campaign
// onboarding-completion signal by Operations and Automation.
export type PendingInvite = { id: string; coach_id: string; created_at: string };

export async function getPendingCoachInvites(): Promise<PendingInvite[]> {
  return restList<PendingInvite>(
    "coach_invite_tokens?used_at=is.null&select=id,coach_id,created_at&limit=500",
  );
}

export { groupDonationsByCampaign };
