"use client";

import { useMemo, useState } from "react";
import type {
  ReportsData, ReportSection, EntityReport, ReportInsight, ReportRecommendation,
  InsightTone, RecommendationPriority,
} from "./types";

type Props = { data: ReportsData };

type TabKey =
  | "executive" | "athleticDirector" | "automation" | "operations" | "crm" | "sponsorIntelligence" | "donation"
  | "campaigns" | "coaches" | "sponsors";

const TABS: Array<{ key: TabKey; label: string; icon: string; entity?: boolean }> = [
  { key: "executive",           label: "Executive Report",           icon: "★" },
  { key: "coaches",              label: "Coach Report",               icon: "☎", entity: true },
  { key: "athleticDirector",     label: "Athletic Director Report",   icon: "◈" },
  { key: "sponsors",             label: "Sponsor Report",             icon: "🏢", entity: true },
  { key: "campaigns",            label: "Campaign Report",            icon: "◫", entity: true },
  { key: "donation",             label: "Donation Report",            icon: "💳" },
  { key: "automation",           label: "Automation Report",          icon: "⚡" },
  { key: "operations",           label: "Operations Report",          icon: "⬡" },
  { key: "crm",                  label: "CRM Report",                 icon: "📇" },
  { key: "sponsorIntelligence",  label: "Sponsor Intelligence Report", icon: "🎯" },
];

const TONE_COLOR: Record<InsightTone, { bg: string; text: string; border: string }> = {
  critical: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
  warning:  { bg: "#fffbeb", text: "#92400e", border: "#fcd34d" },
  neutral:  { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" },
  positive: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
};

const PRIORITY_COLOR: Record<RecommendationPriority, { bg: string; text: string }> = {
  high:   { bg: "#fee2e2", text: "#991b1b" },
  medium: { bg: "#fffbeb", text: "#92400e" },
  low:    { bg: "#f3f4f6", text: "#374151" },
};

const sectionLabel: React.CSSProperties = {
  fontSize: ".68rem", fontWeight: 700, color: "#94a3b8",
  letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".75rem",
};

const cardStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1.1rem 1.25rem",
};

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function exportCSV(report: ReportSection & { entityLabel?: string }) {
  const rows: string[][] = [
    ["Report", report.title],
    ["Audience", report.audience],
    ...(report.entityLabel ? [["Entity", report.entityLabel]] : []),
    ["Summary", report.summary],
    [],
    ["Metric", "Value", "Sublabel"],
    ...report.metrics.map(m => [m.label, String(m.value), m.sublabel ?? ""]),
    [],
    ["Insight", "Tone"],
    ...report.insights.map(i => [i.text, i.tone]),
    [],
    ["Recommendation", "Priority"],
    ...report.recommendations.map(r => [r.text, r.priority]),
  ];
  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.title.replace(/\s+/g, "-").toLowerCase()}${report.entityLabel ? "-" + report.entityLabel.replace(/\s+/g, "-").toLowerCase() : ""}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function BarChart({ title, bars, maxValue }: { title: string; bars: { label: string; value: number; color?: string }[]; maxValue?: number }) {
  if (bars.length === 0) return null;
  const max = maxValue ?? Math.max(1, ...bars.map(b => b.value));
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: ".8rem", fontWeight: 600, color: "#1d1d1f", marginBottom: ".9rem" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: ".55rem" }}>
        {bars.map(b => (
          <div key={b.label} style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
            <div style={{ width: 130, fontSize: ".72rem", color: "#374151", textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{b.label}</div>
            <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 4, height: 10, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, (b.value / max) * 100)}%`, height: "100%", background: b.color ?? "#0b1e3d", borderRadius: 4 }} />
            </div>
            <div style={{ width: 50, fontSize: ".72rem", color: "#6e6e73", textAlign: "right", flexShrink: 0 }}>{Math.round(b.value * 100) / 100}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightRow({ insight }: { insight: ReportInsight }) {
  const c = TONE_COLOR[insight.tone];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".6rem", padding: ".55rem .75rem", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8 }}>
      <span style={{ fontSize: ".78rem", color: c.text, fontWeight: 500 }}>{insight.text}</span>
    </div>
  );
}

function RecommendationRow({ rec }: { rec: ReportRecommendation }) {
  const c = PRIORITY_COLOR[rec.priority];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".6rem", padding: ".55rem .75rem", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
      <span style={{ fontSize: ".68rem", fontWeight: 700, color: c.text, background: c.bg, padding: ".15rem .5rem", borderRadius: 12, textTransform: "uppercase", letterSpacing: ".03em", flexShrink: 0 }}>{rec.priority}</span>
      <span style={{ fontSize: ".78rem", color: "#374151" }}>{rec.text}</span>
    </div>
  );
}

function ReportCard({ report }: { report: (ReportSection & { entityLabel?: string }) }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", flexWrap: "wrap", gap: ".75rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.02em" }}>
            {report.title}{report.entityLabel ? ` — ${report.entityLabel}` : ""}
          </h2>
          <div style={{ fontSize: ".75rem", color: "#94a3b8", marginTop: ".3rem" }}>{report.audience} · {report.summary}</div>
        </div>
        <div style={{ display: "flex", gap: ".5rem" }}>
          <button onClick={() => exportCSV(report)} style={{ padding: ".45rem .85rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".76rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Export CSV
          </button>
          <button disabled title="Coming soon" style={{ padding: ".45rem .85rem", background: "#f8fafc", color: "#94a3b8", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: ".76rem", fontWeight: 600, cursor: "not-allowed", fontFamily: "inherit" }}>
            Export PDF
          </button>
          <button disabled title="Coming soon" style={{ padding: ".45rem .85rem", background: "#f8fafc", color: "#94a3b8", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: ".76rem", fontWeight: 600, cursor: "not-allowed", fontFamily: "inherit" }}>
            Schedule
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <section style={{ marginBottom: "1.5rem" }}>
        <div style={sectionLabel}>Key Metrics</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: ".9rem" }}>
          {report.metrics.map(m => (
            <div key={m.label} style={cardStyle}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1d1d1f", lineHeight: 1 }}>{m.value}</div>
              <div style={{ fontSize: ".72rem", color: "#6e6e73", marginTop: ".4rem", fontWeight: 500 }}>{m.label}</div>
              {m.sublabel && <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: ".15rem" }}>{m.sublabel}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* Charts */}
      {report.charts.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <div style={sectionLabel}>Charts</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
            {report.charts.map(c => <BarChart key={c.title} title={c.title} bars={c.bars} maxValue={c.maxValue} />)}
          </div>
        </section>
      )}

      {/* Insights + Recommendations */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <section>
          <div style={sectionLabel}>Insights</div>
          <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
            {report.insights.map((i, idx) => <InsightRow key={idx} insight={i} />)}
          </div>
        </section>
        <section>
          <div style={sectionLabel}>Recommended Actions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
            {report.recommendations.map((r, idx) => <RecommendationRow key={idx} rec={r} />)}
          </div>
        </section>
      </div>

      {/* Detail tables */}
      {report.detail && Object.entries(report.detail).map(([name, rows]) => rows.length > 0 && (
        <section key={name} style={{ marginBottom: "1.5rem" }}>
          <div style={sectionLabel}>{name}</div>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            {rows.map((row, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", padding: ".6rem 1rem", borderBottom: idx < rows.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                <div>
                  <div style={{ fontSize: ".78rem", fontWeight: 600, color: "#1d1d1f" }}>{row.label}</div>
                  {row.sublabel && <div style={{ fontSize: ".7rem", color: "#94a3b8" }}>{row.sublabel}</div>}
                </div>
                <div style={{ fontSize: ".78rem", color: "#374151", fontWeight: 600, whiteSpace: "nowrap" }}>{row.value}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EntitySelector({ entities, selectedId, onChange }: { entities: EntityReport[]; selectedId: string; onChange: (id: string) => void }) {
  return (
    <select
      value={selectedId}
      onChange={e => onChange(e.target.value)}
      style={{ padding: ".5rem .75rem", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: ".85rem", fontFamily: "inherit", background: "#fff", marginBottom: "1.25rem" }}
    >
      {entities.map(e => <option key={e.entityId} value={e.entityId}>{e.entityLabel}</option>)}
    </select>
  );
}

export default function ReportsDashboard({ data }: Props) {
  const [tab, setTab] = useState<TabKey>("executive");
  const [campaignId, setCampaignId] = useState(data.campaigns[0]?.entityId ?? "");
  const [coachId, setCoachId]       = useState(data.coaches[0]?.entityId ?? "");
  const [sponsorId, setSponsorId]   = useState(data.sponsors[0]?.entityId ?? "");

  const activeReport: (ReportSection & { entityLabel?: string }) | null = useMemo(() => {
    switch (tab) {
      case "executive":           return data.executive;
      case "athleticDirector":    return data.athleticDirector;
      case "automation":          return data.automation;
      case "operations":          return data.operations;
      case "crm":                 return data.crm;
      case "sponsorIntelligence": return data.sponsorIntelligence;
      case "donation":            return data.donation;
      case "campaigns":           return data.campaigns.find(c => c.entityId === campaignId) ?? null;
      case "coaches":             return data.coaches.find(c => c.entityId === coachId) ?? null;
      case "sponsors":            return data.sponsors.find(s => s.entityId === sponsorId) ?? null;
      default:                    return null;
    }
  }, [tab, data, campaignId, coachId, sponsorId]);

  return (
    <div style={{ padding: "2rem", maxWidth: 1300, margin: "0 auto" }}>

      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.02em" }}>Reports</h1>
        <div style={{ fontSize: ".75rem", color: "#94a3b8", marginTop: ".3rem" }}>
          Reports that explain performance, identify risks, and recommend next actions — generated {new Date(data.generatedAt).toLocaleString()}.
        </div>
      </div>

      {/* Report type tabs */}
      <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: "flex", alignItems: "center", gap: ".4rem",
              padding: ".45rem .85rem", borderRadius: 8, fontSize: ".78rem", fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
              background: tab === t.key ? "#0b1e3d" : "#fff",
              color: tab === t.key ? "#fff" : "#374151",
              border: `1px solid ${tab === t.key ? "#0b1e3d" : "#e5e7eb"}`,
            }}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Entity selector for scoped reports */}
      {tab === "campaigns" && data.campaigns.length > 0 && (
        <EntitySelector entities={data.campaigns} selectedId={campaignId} onChange={setCampaignId} />
      )}
      {tab === "coaches" && data.coaches.length > 0 && (
        <EntitySelector entities={data.coaches} selectedId={coachId} onChange={setCoachId} />
      )}
      {tab === "sponsors" && data.sponsors.length > 0 && (
        <EntitySelector entities={data.sponsors} selectedId={sponsorId} onChange={setSponsorId} />
      )}

      {activeReport ? (
        <ReportCard report={activeReport} />
      ) : (
        <div style={{ background: "#fff", border: "1px dashed #d1d5db", borderRadius: 10, padding: "2.5rem 1rem", textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: ".5rem" }}>📊</div>
          <div style={{ fontSize: ".85rem", fontWeight: 600, color: "#374151" }}>No data available for this report yet</div>
        </div>
      )}
    </div>
  );
}
