"use client";

import { useRouter } from "next/navigation";
import type { ExecutiveData, Insight, InsightTone, TimelineItem, TimelineKind } from "./types";

type Props = { data: ExecutiveData };

const sectionLabel: React.CSSProperties = {
  fontSize: ".68rem", fontWeight: 700, color: "#94a3b8",
  letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".75rem",
};

const cardStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1.1rem",
};

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function KpiCard({ label, value, icon, sublabel }: { label: string; value: string | number; icon: string; sublabel?: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: "1.1rem", marginBottom: ".35rem" }}>{icon}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#1d1d1f", lineHeight: 1 }}>{value}</div>
      {sublabel && <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: ".2rem" }}>{sublabel}</div>}
      <div style={{ fontSize: ".72rem", color: "#6e6e73", marginTop: ".35rem", fontWeight: 500 }}>{label}</div>
    </div>
  );
}

const TONE_COLOR: Record<InsightTone, { bg: string; text: string; border: string }> = {
  positive: { bg: "#f0fdf4", text: "#166534", border: "#86efac" },
  neutral:  { bg: "#f8fafc", text: "#374151", border: "#e2e8f0" },
  warning:  { bg: "#fffbeb", text: "#92400e", border: "#fcd34d" },
  critical: { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
};

function InsightRow({ insight }: { insight: Insight }) {
  const c = TONE_COLOR[insight.tone];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: ".6rem",
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8,
      padding: ".65rem .9rem", fontSize: ".82rem", fontWeight: 500, color: c.text,
    }}>
      {insight.text}
    </div>
  );
}

const TIMELINE_ICON: Record<TimelineKind, string> = {
  audit: "☰", crm: "☎", automation: "⚡", donation: "💳", campaign: "🏕",
};

function TimelineRow({ item }: { item: TimelineItem }) {
  return (
    <a href={item.href} style={{ textDecoration: "none", display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".6rem 0", borderBottom: "1px solid #f3f4f6" }}>
        <span style={{
          width: 28, height: 28, borderRadius: 6, background: "#f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: ".8rem",
        }}>
          {TIMELINE_ICON[item.kind]}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: ".8rem", fontWeight: 500, color: "#1d1d1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.title}
          </div>
          {item.detail && (
            <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: ".1rem" }}>{item.detail}</div>
          )}
        </div>
        <div style={{ fontSize: ".68rem", color: "#94a3b8", whiteSpace: "nowrap" }}>{relativeTime(item.at)}</div>
      </div>
    </a>
  );
}

function DistributionBar({ healthy, watch, atRisk }: { healthy: number; watch: number; atRisk: number }) {
  const total = healthy + watch + atRisk;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <div>
      <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: "#f1f5f9" }}>
        <div style={{ width: `${pct(healthy)}%`, background: "#16a34a" }} />
        <div style={{ width: `${pct(watch)}%`, background: "#d97706" }} />
        <div style={{ width: `${pct(atRisk)}%`, background: "#dc2626" }} />
      </div>
      <div style={{ display: "flex", gap: "1rem", marginTop: ".6rem", fontSize: ".74rem", color: "#374151" }}>
        <span>🟢 Healthy: {healthy}</span>
        <span>🟠 Watch: {watch}</span>
        <span>🔴 At Risk: {atRisk}</span>
      </div>
    </div>
  );
}

export default function ExecutiveDashboard({ data }: Props) {
  const router = useRouter();
  const { kpis, campaignHealth, donationMomentum, coachPipeline, automationHealth, forecast, sponsorIntel, insights, timeline, generatedAt } = data;

  const genDate = new Date(generatedAt);
  const dateStr = genDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const timeStr = genDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const QUICK_ACTIONS = [
    { id: "operations", label: "Operations", icon: "⬡", href: "/admin/operations" },
    { id: "crm",        label: "Coach CRM",  icon: "☎", href: "/admin/crm" },
    { id: "health",     label: "Team Health", icon: "♥", href: "/admin/health" },
    { id: "automation", label: "Automation", icon: "⚡", href: "/admin/automation" },
    { id: "analytics",  label: "Analytics",  icon: "╱", href: "/admin/analytics" },
    { id: "campaigns",  label: "Campaigns",  icon: "◫", href: "/admin/campaigns" },
  ];

  return (
    <div style={{ padding: "2rem", maxWidth: 1300, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.02em" }}>
          Executive Dashboard
        </h2>
        <div style={{ fontSize: ".75rem", color: "#94a3b8", marginTop: ".3rem" }}>
          {dateStr} · Generated at {timeStr}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginBottom: "2rem" }}>
        {QUICK_ACTIONS.map(qa => (
          <button
            key={qa.id}
            onClick={() => router.push(qa.href)}
            style={{
              display: "flex", alignItems: "center", gap: ".4rem",
              padding: ".4rem .85rem", background: "#fff", border: "1px solid #e5e7eb",
              borderRadius: 8, cursor: "pointer", fontSize: ".78rem", fontWeight: 500,
              color: "#374151", fontFamily: "inherit",
            }}
            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#94a3b8"; }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e7eb"; }}
          >
            <span style={{ fontSize: ".85rem" }}>{qa.icon}</span>
            {qa.label}
          </button>
        ))}
      </div>

      {/* Executive Summary — KPIs */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Executive Summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: ".9rem" }}>
          <KpiCard label="Total Campaigns"     value={kpis.totalCampaigns}                     icon="🏕" />
          <KpiCard label="Active Campaigns"    value={kpis.activeCampaigns}                    icon="▶" />
          <KpiCard label="Total Raised"        value={money(kpis.totalRaisedCents)}            icon="💰" />
          <KpiCard label="Est. ELF Revenue"    value={money(kpis.estimatedElfRevenueCents)}     icon="🏦" sublabel="Estimate" />
          <KpiCard label="Total Donations"     value={kpis.totalDonations}                      icon="💳" />
          <KpiCard label="Average Donation"    value={money(kpis.avgDonationCents)}             icon="📊" />
          <KpiCard label="Average Campaign"    value={money(kpis.avgCampaignCents)}             icon="📈" />
          <KpiCard label="Active Coaches"      value={kpis.activeCoaches}                       icon="👤" />
          <KpiCard label="Teams At Risk"       value={kpis.teamsAtRisk}                         icon="⚠️" />
          <KpiCard label="Healthy Teams"       value={kpis.healthyTeams}                        icon="✅" />
          <KpiCard label="CRM Pipeline Value"  value={money(kpis.crmPipelineValueCents)}        icon="☎" />
          <KpiCard label="Open Automation Events" value={kpis.openAutomationEvents}             icon="⚡" />
          <KpiCard label="Sponsor Businesses"  value={kpis.sponsorBusinesses}                   icon="🏢" />
          <KpiCard label="Sponsor Lifetime Value" value={money(kpis.sponsorLifetimeValueCents)} icon="📈" />
          <KpiCard label="Sponsor Renewals Due" value={kpis.sponsorRenewalsDue}                 icon="⏰" />
        </div>
      </section>

      {/* Business Health */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Business Health</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>

          <div style={cardStyle}>
            <div style={{ fontSize: ".8rem", fontWeight: 600, color: "#1d1d1f", marginBottom: ".75rem" }}>Campaign Health Distribution</div>
            <DistributionBar healthy={campaignHealth.healthy} watch={campaignHealth.watch} atRisk={campaignHealth.atRisk} />
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: ".8rem", fontWeight: 600, color: "#1d1d1f", marginBottom: ".75rem" }}>Donation Momentum</div>
            <div style={{ display: "flex", gap: "1.5rem" }}>
              <div>
                <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#1d1d1f" }}>{money(donationMomentum.last7Cents)}</div>
                <div style={{ fontSize: ".7rem", color: "#94a3b8" }}>Last 7 Days · {donationMomentum.last7Count} donations</div>
              </div>
              <div>
                <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#1d1d1f" }}>{money(donationMomentum.last30Cents)}</div>
                <div style={{ fontSize: ".7rem", color: "#94a3b8" }}>Last 30 Days · {donationMomentum.last30Count} donations</div>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: ".8rem", fontWeight: 600, color: "#1d1d1f", marginBottom: ".75rem" }}>Coach Pipeline</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: ".5rem", fontSize: ".76rem", color: "#374151" }}>
              <div><span style={{ fontWeight: 700 }}>{coachPipeline.prospects}</span> Prospects</div>
              <div><span style={{ fontWeight: 700 }}>{coachPipeline.demos}</span> Demos</div>
              <div><span style={{ fontWeight: 700 }}>{coachPipeline.proposals}</span> Proposals</div>
              <div><span style={{ fontWeight: 700 }}>{coachPipeline.signed}</span> Signed</div>
              <div><span style={{ fontWeight: 700 }}>{coachPipeline.returning}</span> Returning</div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: ".8rem", fontWeight: 600, color: "#1d1d1f", marginBottom: ".75rem" }}>Automation Health</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: ".5rem", fontSize: ".76rem", color: "#374151" }}>
              <div>Last Run: <strong style={{ textTransform: "capitalize" }}>{automationHealth.lastRunStatus ?? "—"}</strong> ({relativeTime(automationHealth.lastRunAt)})</div>
              <div>Failed Runs: <strong>{automationHealth.failedRuns}</strong></div>
              <div>Critical Events: <strong>{automationHealth.criticalEvents}</strong></div>
              <div>Warning Events: <strong>{automationHealth.warningEvents}</strong></div>
            </div>
          </div>

        </div>
      </section>

      {/* Revenue Forecast */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Revenue Forecast <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— estimated from current pace, not guaranteed</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: ".9rem" }}>
          <KpiCard label="Projected Campaign Revenue" value={money(forecast.projectedCampaignRevenueCents)} icon="📉" sublabel="Estimate" />
          <KpiCard label="Projected Platform Revenue" value={money(forecast.projectedPlatformRevenueCents)} icon="🏦" sublabel={`Estimate at ${forecast.feeRatePct}%`} />
          <KpiCard label="Likely To Hit Goal"    value={forecast.likelyToHitGoal}    icon="✅" />
          <KpiCard label="Unlikely To Hit Goal"  value={forecast.unlikelyToHitGoal}  icon="⚠️" />
        </div>
      </section>

      {/* Sponsor Intelligence Summary */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Sponsor Intelligence Summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: ".8rem", fontWeight: 600, color: "#1d1d1f", marginBottom: ".6rem" }}>Top Sponsors</div>
            {sponsorIntel.topSponsors.length === 0 ? (
              <div style={{ fontSize: ".74rem", color: "#94a3b8" }}>No sponsors scored yet.</div>
            ) : (
              sponsorIntel.topSponsors.map(s => (
                <div key={s.businessName} style={{ display: "flex", justifyContent: "space-between", padding: ".3rem 0", fontSize: ".78rem", color: "#374151" }}>
                  <span>{s.businessName}</span>
                  <strong>{s.score}</strong>
                </div>
              ))
            )}
          </div>
          <div style={cardStyle}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem", fontSize: ".76rem", color: "#374151" }}>
              <div>Renewals Next 30 Days<br /><strong style={{ fontSize: "1.1rem" }}>{sponsorIntel.renewalsNext30}</strong></div>
              <div>Businesses Added This Month<br /><strong style={{ fontSize: "1.1rem" }}>{sponsorIntel.businessesAddedThisMonth}</strong></div>
              <div>Largest Lifetime Sponsor<br />
                <strong>{sponsorIntel.largestLifetimeSponsor?.businessName ?? "—"}</strong>
                {sponsorIntel.largestLifetimeSponsor && <div style={{ color: "#16a34a" }}>{money(sponsorIntel.largestLifetimeSponsor.valueCents)}</div>}
              </div>
              <div>Largest Annual Budget<br />
                <strong>{sponsorIntel.largestBudgetSponsor?.businessName ?? "—"}</strong>
                {sponsorIntel.largestBudgetSponsor && <div style={{ color: "#16a34a" }}>{money(sponsorIntel.largestBudgetSponsor.budgetCents)}</div>}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Executive Insights + Timeline */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", alignItems: "start" }}>

        <section>
          <div style={sectionLabel}>Executive Insights</div>
          <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
            {insights.map((insight, i) => <InsightRow key={i} insight={insight} />)}
          </div>
        </section>

        <section>
          <div style={sectionLabel}>Executive Timeline</div>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "0 1rem" }}>
            {timeline.length === 0 ? (
              <div style={{ padding: "1.5rem 0", textAlign: "center", fontSize: ".78rem", color: "#94a3b8" }}>
                No recent activity
              </div>
            ) : (
              timeline.map(item => <TimelineRow key={item.id} item={item} />)
            )}
          </div>
        </section>

      </div>

    </div>
  );
}
