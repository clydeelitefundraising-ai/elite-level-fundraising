export type HealthLabel = "healthy" | "watch" | "at_risk";

export const HEALTH_LABELS: Record<HealthLabel, string> = {
  healthy: "Healthy",
  watch:   "Watch",
  at_risk: "At Risk",
};

export type TeamHealth = {
  slug:              string;
  schoolName:        string;
  sportName:         string;
  season:             string;
  archived:           boolean;
  score:              number;
  label:              HealthLabel;
  reasons:            string[];
  raisedCents:        number;
  goalCents:          number;
  pctToGoal:          number;
  daysRemaining:      number | null;
  deadline:           string;
  lastDonationAt:     string | null;
  daysSinceLastDonation: number | null;
  athleteCount:       number;
  memberCount:        number;
  lastActivityAt:     string | null;
};

export type HealthSummary = {
  totalTeams:          number;
  healthy:             number;
  watch:               number;
  atRisk:              number;
  averageScore:        number;
  behindPaceCount:     number;
};

export type HealthData = {
  teams:   TeamHealth[];
  summary: HealthSummary;
};
