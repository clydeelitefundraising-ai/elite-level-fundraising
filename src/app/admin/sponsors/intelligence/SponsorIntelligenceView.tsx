"use client";

import { useState } from "react";
import type { SponsorIntelligenceData, ScoredSponsor, SponsorRecommendation } from "./types";

type Props = { data: SponsorIntelligenceData };

const sectionLabel: React.CSSProperties = {
  fontSize: ".68rem", fontWeight: 700, color: "#94a3b8",
  letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".75rem",
};

const cardStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1.1rem",
};

const inputStyle: React.CSSProperties = {
  padding: ".5rem .75rem", border: "1px solid #e5e7eb", borderRadius: 8,
  fontSize: ".85rem", color: "#1d1d1f", background: "#fff", outline: "none", fontFamily: "inherit",
};

function money(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: "1.1rem", marginBottom: ".35rem" }}>{icon}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#1d1d1f", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: ".72rem", color: "#6e6e73", marginTop: ".35rem", fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? { bg: "#dcfce7", text: "#166534" } : score >= 40 ? { bg: "#fffbeb", text: "#92400e" } : { bg: "#fee2e2", text: "#991b1b" };
  return (
    <span style={{ fontSize: ".72rem", fontWeight: 700, color: color.text, background: color.bg, padding: ".15rem .55rem", borderRadius: 12, whiteSpace: "nowrap" }}>
      {score}
    </span>
  );
}

function ScoredSponsorRow({ item }: { item: ScoredSponsor }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".55rem 0", borderBottom: "1px solid #f3f4f6" }}>
      <ScoreBadge score={item.score} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: ".8rem", fontWeight: 600, color: "#1d1d1f" }}>{item.sponsor.business_name}</div>
        <div style={{ fontSize: ".68rem", color: "#94a3b8" }}>{item.sponsor.industry ?? "—"}{item.sponsor.city ? ` · ${item.sponsor.city}` : ""}</div>
      </div>
      <div style={{ fontSize: ".76rem", fontWeight: 600, color: "#16a34a" }}>{money(item.sponsor.lifetime_value)}</div>
    </div>
  );
}

function SimpleSponsorRow({ name, sublabel, trailing }: { name: string; sublabel?: string; trailing?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".5rem 0", borderBottom: "1px solid #f3f4f6" }}>
      <div>
        <div style={{ fontSize: ".8rem", fontWeight: 500, color: "#1d1d1f" }}>{name}</div>
        {sublabel && <div style={{ fontSize: ".68rem", color: "#94a3b8" }}>{sublabel}</div>}
      </div>
      {trailing && <div style={{ fontSize: ".76rem", fontWeight: 600, color: "#374151" }}>{trailing}</div>}
    </div>
  );
}

function InsightCard({ id, title, children, empty }: { id: string; title: string; children: React.ReactNode; empty: boolean }) {
  return (
    <div id={id} style={cardStyle}>
      <div style={{ fontSize: ".8rem", fontWeight: 600, color: "#1d1d1f", marginBottom: ".5rem" }}>{title}</div>
      {empty ? <div style={{ fontSize: ".74rem", color: "#94a3b8" }}>No data yet</div> : children}
    </div>
  );
}

export default function SponsorIntelligenceView({ data }: Props) {
  const { topSponsors, insights, renewalForecast, campaigns, totalScored, averageScore } = data;

  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [recommendations, setRecommendations] = useState<SponsorRecommendation[] | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);

  async function loadRecommendations(slug: string) {
    setSelectedCampaign(slug);
    if (!slug) { setRecommendations(null); return; }
    setLoadingRec(true);
    try {
      const res = await fetch(`/api/admin/sponsor-businesses/recommendations?campaign_slug=${encodeURIComponent(slug)}`);
      if (res.ok) setRecommendations(await res.json());
    } finally {
      setLoadingRec(false);
    }
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 1300, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: ".75rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.02em" }}>Sponsor Intelligence</h2>
          <div style={{ fontSize: ".75rem", color: "#94a3b8", marginTop: ".3rem" }}>
            Relationship scoring, campaign-fit recommendations, and renewal forecasting.
          </div>
        </div>
        <a href="/admin/sponsors" style={{ fontSize: ".78rem", fontWeight: 600, color: "#2563eb", textDecoration: "none" }}>
          ← Sponsor Directory
        </a>
      </div>

      {/* Quick Actions */}
      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginBottom: "2rem" }}>
        {[
          { id: "recommendations", label: "View Recommendations", icon: "🎯" },
          { id: "renewals",        label: "View Renewals",        icon: "⏰" },
          { id: "top-sponsors",    label: "View Top Sponsors",    icon: "🏆" },
        ].map(qa => (
          <a key={qa.id} href={`#${qa.id}`} style={{
            display: "flex", alignItems: "center", gap: ".4rem", padding: ".4rem .85rem",
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, textDecoration: "none",
            fontSize: ".78rem", fontWeight: 500, color: "#374151",
          }}>
            <span style={{ fontSize: ".85rem" }}>{qa.icon}</span>{qa.label}
          </a>
        ))}
      </div>

      {/* Summary cards */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: ".9rem" }}>
          <StatCard label="Sponsors Scored"    value={totalScored}                  icon="🏢" />
          <StatCard label="Average Score"      value={averageScore}                 icon="📊" />
          <StatCard label="Renewals Overdue"   value={renewalForecast.overdue}      icon="🚨" />
          <StatCard label="Renewals Next 30d"  value={renewalForecast.next30}       icon="⏰" />
          <StatCard label="Renewals Next 60d"  value={renewalForecast.next60}       icon="📅" />
          <StatCard label="Renewals Next 90d"  value={renewalForecast.next90}       icon="🗓" />
        </div>
      </section>

      {/* Recommendations */}
      <section id="recommendations" style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Campaign Recommendations</div>
        <div style={cardStyle}>
          <div style={{ marginBottom: "1rem" }}>
            <select value={selectedCampaign} onChange={e => loadRecommendations(e.target.value)} style={{ ...inputStyle, minWidth: 280 }}>
              <option value="">Select a campaign…</option>
              {campaigns.map(c => (
                <option key={c.campaign_slug} value={c.campaign_slug}>{c.school_name} · {c.sport_name}</option>
              ))}
            </select>
          </div>

          {!selectedCampaign ? (
            <div style={{ fontSize: ".78rem", color: "#94a3b8" }}>Select a campaign to see recommended sponsors.</div>
          ) : loadingRec ? (
            <div style={{ fontSize: ".78rem", color: "#94a3b8" }}>Loading recommendations…</div>
          ) : !recommendations || recommendations.length === 0 ? (
            <div style={{ fontSize: ".78rem", color: "#94a3b8" }}>No matching sponsors found for this campaign yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
              {recommendations.map(rec => (
                <div key={rec.sponsor.id} style={{ display: "flex", alignItems: "flex-start", gap: ".75rem", padding: ".6rem 0", borderBottom: "1px solid #f3f4f6" }}>
                  <ScoreBadge score={rec.matchScore} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: ".82rem", fontWeight: 600, color: "#1d1d1f" }}>{rec.sponsor.business_name}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: ".3rem", marginTop: ".3rem" }}>
                      {rec.reasons.map(r => (
                        <span key={r} style={{ fontSize: ".64rem", fontWeight: 500, color: "#475569", background: "#f1f5f9", padding: ".1rem .45rem", borderRadius: 6 }}>
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Renewal forecast detail */}
      <section id="renewals" style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Upcoming Renewals</div>
        <div style={cardStyle}>
          {renewalForecast.upcoming.length === 0 ? (
            <div style={{ fontSize: ".78rem", color: "#94a3b8" }}>No upcoming renewals scheduled.</div>
          ) : (
            renewalForecast.upcoming.map(s => (
              <SimpleSponsorRow key={s.id} name={s.business_name} sublabel={s.industry ?? undefined} trailing={fmtDate(s.next_renewal_at)} />
            ))
          )}
        </div>
      </section>

      {/* Top Sponsors */}
      <section id="top-sponsors" style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Top Sponsors by Score</div>
        <div style={cardStyle}>
          {topSponsors.length === 0 ? (
            <div style={{ fontSize: ".78rem", color: "#94a3b8" }}>No sponsors scored yet.</div>
          ) : (
            topSponsors.map(item => <ScoredSponsorRow key={item.sponsor.id} item={item} />)
          )}
        </div>
      </section>

      {/* Sponsor Insights */}
      <section>
        <div style={sectionLabel}>Sponsor Insights</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem" }}>

          <InsightCard id="top-lifetime" title="Top Lifetime Sponsors" empty={insights.topLifetime.length === 0}>
            {insights.topLifetime.map(s => <SimpleSponsorRow key={s.id} name={s.business_name} trailing={money(s.lifetime_value)} />)}
          </InsightCard>

          <InsightCard id="most-active" title="Most Active Sponsors" empty={insights.mostActive.length === 0}>
            {insights.mostActive.map(({ sponsor, activityCount }) => (
              <SimpleSponsorRow key={sponsor.id} name={sponsor.business_name} trailing={`${activityCount} activities`} />
            ))}
          </InsightCard>

          <InsightCard id="highest-budget" title="Highest Estimated Budgets" empty={insights.highestBudget.length === 0}>
            {insights.highestBudget.map(s => <SimpleSponsorRow key={s.id} name={s.business_name} trailing={money(s.estimated_annual_budget ?? 0)} />)}
          </InsightCard>

          <InsightCard id="most-diverse" title="Most Diverse Sponsors (Sports)" empty={insights.mostDiverse.length === 0}>
            {insights.mostDiverse.map(({ sponsor, sportCount }) => (
              <SimpleSponsorRow key={sponsor.id} name={sponsor.business_name} sublabel={sponsor.preferred_sports.join(", ")} trailing={`${sportCount}`} />
            ))}
          </InsightCard>

          <InsightCard id="recently-lost" title="Recently Lost Sponsors" empty={insights.recentlyLost.length === 0}>
            {insights.recentlyLost.map(s => <SimpleSponsorRow key={s.id} name={s.business_name} trailing={fmtDate(s.updated_at)} />)}
          </InsightCard>

          <InsightCard id="inactive" title="Inactive Sponsors" empty={insights.inactiveSponsors.length === 0}>
            {insights.inactiveSponsors.map(s => (
              <SimpleSponsorRow key={s.id} name={s.business_name} trailing={s.last_sponsored_at ? fmtDate(s.last_sponsored_at) : "Never sponsored"} />
            ))}
          </InsightCard>

        </div>
      </section>

    </div>
  );
}
