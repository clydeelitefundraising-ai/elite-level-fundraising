export type {
  ScoredSponsor, SponsorScoreFactors, SponsorRecommendation, SponsorInsights, RenewalForecast,
} from "@/lib/platform/sponsors";
import type { ScoredSponsor, SponsorInsights, RenewalForecast } from "@/lib/platform/sponsors";

export type CampaignOption = {
  campaign_slug: string;
  school_name:   string;
  sport_name:    string;
};

export type SponsorIntelligenceData = {
  topSponsors:      ScoredSponsor[];
  insights:         SponsorInsights;
  renewalForecast:  RenewalForecast;
  campaigns:        CampaignOption[];
  totalScored:      number;
  averageScore:     number;
};
