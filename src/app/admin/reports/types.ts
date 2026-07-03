export type InsightTone = "positive" | "neutral" | "warning" | "critical";
export type ReportInsight = { text: string; tone: InsightTone };

export type RecommendationPriority = "high" | "medium" | "low";
export type ReportRecommendation = { text: string; priority: RecommendationPriority };

export type ReportMetric = { label: string; value: string | number; sublabel?: string };
export type ReportChartBar = { label: string; value: number; color?: string };
export type ReportChart = { title: string; bars: ReportChartBar[]; maxValue?: number };
export type ReportDetailRow = { label: string; value: string; sublabel?: string };

export type ReportSection = {
  id:              string;
  title:           string;
  audience:        string;
  summary:         string;
  metrics:         ReportMetric[];
  charts:          ReportChart[];
  insights:        ReportInsight[];
  recommendations: ReportRecommendation[];
  detail?:         Record<string, ReportDetailRow[]>;
};

export type EntityReport = ReportSection & { entityId: string; entityLabel: string };

export type ReportsData = {
  executive:           ReportSection;
  athleticDirector:    ReportSection;
  automation:          ReportSection;
  operations:          ReportSection;
  crm:                 ReportSection;
  sponsorIntelligence: ReportSection;
  donation:            ReportSection;
  campaigns:           EntityReport[];
  coaches:             EntityReport[];
  sponsors:            EntityReport[];
  generatedAt:         string;
};
