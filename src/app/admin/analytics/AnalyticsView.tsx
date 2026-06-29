"use client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CampaignAnalytics = {
  slug:                  string;
  name:                  string;
  sport:                 string;
  season:                string;
  archived:              boolean;
  primaryColor:          string;
  goalCents:             number;
  deadline:              string;
  raisedCents:           number;
  donationCount:         number;
  athleteCount:          number;
  memberCount:           number;
  athleteAccounts:       number;
  parentLinks:           number;
  contactsCollected:     number;
  totalContactGoal:      number;
  pctToGoal:             number;
  adoptionPct:           number;
  contactCompletionPct:  number;
  avgDonationCents:      number;
};

export type AnalyticsData = {
  totalRaisedCents:         number;
  totalDonations:           number;
  avgDonationCents:         number;
  activeCampaigns:          number;
  totalCampaigns:           number;
  totalAthletes:            number;
  totalAccounts:            number;
  contactsCollected:        number;
  messagesSent:             number;
  campaigns:                CampaignAnalytics[];
  topAthletes:              { id: string; name: string; campaign: string; raisedCents: number }[];
  recentDonations:          { campaign: string; athlete: string; cents: number; date: string }[];
  athletesWithZeroContacts: number;
  athletesAtGoal:           number;
  totalAthleteMembers:      number;
  athleteAccounts:          number;
  parentLinksTotal:         number;
  coachAccounts:            number;
  accountsByRole:           Record<string, number>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt$ = (c: number) =>
  c >= 100000
    ? `$${(c / 100 / 1000).toFixed(1)}k`
    : `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const fmtFull$ = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function pctColor(pct: number): string {
  if (pct >= 75) return "#16a34a";
  if (pct >= 40) return "#d97706";
  return "#dc2626";
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  sectionTitle: { fontSize: ".82rem", fontWeight: 800, color: "#1d1d1f", letterSpacing: "-.01em", margin: "0 0 1rem" } as React.CSSProperties,
  label:        { fontSize: ".65rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase" as const, letterSpacing: ".05em" },
  card:         { background: "#fff", borderRadius: 14, border: "1px solid #f0f0f2", padding: "1.25rem" } as React.CSSProperties,
  muted:        { fontSize: ".72rem", color: "#98989d" } as React.CSSProperties,
};

import React from "react";

// ── Shared components ─────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{ ...T.card, minWidth: 130 }}>
      <div style={{ fontSize: "1.6rem", fontWeight: 800, color: accent ?? "#1d1d1f", letterSpacing: "-.03em", lineHeight: 1 }}>{value}</div>
      <div style={{ ...T.label, marginTop: ".4rem" }}>{label}</div>
      {sub && <div style={{ ...T.muted, marginTop: ".25rem" }}>{sub}</div>}
    </div>
  );
}

function MiniBar({ pct, color, height = 5 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: "#f0f0f2", borderRadius: height, overflow: "hidden", flex: 1 }}>
      <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: height, transition: "width .3s" }} />
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...T.card, marginBottom: "1.25rem" }}>
      <h2 style={T.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

function StatusBadge({ archived }: { archived: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: ".3rem", padding: ".15rem .5rem", borderRadius: 6, fontSize: ".65rem", fontWeight: 700, background: archived ? "#f3f4f6" : "#dcfce7", color: archived ? "#6b7280" : "#15803d" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: archived ? "#9ca3af" : "#16a34a", display: "inline-block" }} />
      {archived ? "Archived" : "Live"}
    </span>
  );
}

function AdoptionBar({ value, total, label, color }: { value: number; total: number; label: string; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ marginBottom: ".9rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ".3rem" }}>
        <span style={{ ...T.label }}>{label}</span>
        <span style={{ fontSize: ".75rem", fontWeight: 700, color: "#1d1d1f" }}>
          {value}<span style={{ color: "#98989d", fontWeight: 400 }}>/{total}</span>
          <span style={{ color: "#98989d", fontWeight: 400, marginLeft: ".35rem" }}>({pct}%)</span>
        </span>
      </div>
      <MiniBar pct={pct} color={color} height={7} />
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function AnalyticsView({ data }: { data: AnalyticsData }) {
  const d = data;
  const platformAdoptionPct = d.totalAthletes > 0
    ? Math.round((d.athleteAccounts / d.totalAthletes) * 100)
    : 0;
  const parentLinkPct = d.totalAthletes > 0
    ? Math.round((d.parentLinksTotal / d.totalAthletes) * 100)
    : 0;

  const ROLE_LABELS: Record<string, string> = {
    head_coach: "Head Coaches", assistant_coach: "Asst. Coaches",
    booster: "Boosters", athlete: "Athletes", parent: "Parents",
  };

  return (
    <div style={{ padding: "1.5rem 2rem", fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 1200 }}>

      {/* ── 1. Overview KPIs ─────────────────────────────────────────── */}
      <h2 style={{ ...T.sectionTitle, marginBottom: "1rem" }}>Platform Overview</h2>
      <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginBottom: "1.75rem" }}>
        <KpiCard label="Total Raised"       value={fmtFull$(d.totalRaisedCents)} accent="#15803d" />
        <KpiCard label="Total Donations"    value={d.totalDonations} sub={`avg ${fmtFull$(d.avgDonationCents)}`} />
        <KpiCard label="Active Campaigns"   value={d.activeCampaigns} sub={`of ${d.totalCampaigns} total`} />
        <KpiCard label="Total Athletes"     value={d.totalAthletes} />
        <KpiCard label="Active Accounts"    value={d.totalAccounts} sub={`${platformAdoptionPct}% athlete adoption`} />
        <KpiCard label="Contacts Collected" value={d.contactsCollected} />
        <KpiCard label="Messages Sent"      value={d.messagesSent} />
      </div>

      {/* ── 2. Campaign Performance Table ─────────────────────────────── */}
      <SectionCard title="Campaign Performance">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".78rem", minWidth: 860 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f0f0f2" }}>
                {["Campaign", "Status", "Raised", "Goal", "% to Goal", "Donations", "Athletes", "Accounts", "Contacts", "Adoption", "Deadline"].map(h => (
                  <th key={h} style={{ padding: ".55rem .75rem", textAlign: "left", ...T.label, background: "#fafafa", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.campaigns.map((c, i) => (
                <tr key={c.slug} style={{ borderBottom: i < d.campaigns.length - 1 ? "1px solid #f5f5f7" : "none" }}>
                  <td style={{ padding: ".65rem .75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                      <div style={{ width: 3, height: 26, borderRadius: 2, background: c.primaryColor, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 600, color: "#1d1d1f", whiteSpace: "nowrap" }}>{c.name}</div>
                        <div style={{ fontSize: ".65rem", color: "#98989d" }}>{c.sport} · {c.season}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: ".65rem .75rem" }}><StatusBadge archived={c.archived} /></td>
                  <td style={{ padding: ".65rem .75rem", fontWeight: 700, color: "#1d1d1f" }}>{fmtFull$(c.raisedCents)}</td>
                  <td style={{ padding: ".65rem .75rem", color: "#6e6e73" }}>{c.goalCents > 0 ? fmtFull$(c.goalCents) : "—"}</td>
                  <td style={{ padding: ".65rem .75rem" }}>
                    {c.goalCents > 0 ? (
                      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", minWidth: 80 }}>
                        <MiniBar pct={c.pctToGoal} color={pctColor(c.pctToGoal)} />
                        <span style={{ fontSize: ".72rem", fontWeight: 600, color: pctColor(c.pctToGoal), whiteSpace: "nowrap" }}>{c.pctToGoal}%</span>
                      </div>
                    ) : <span style={{ color: "#c7c7cc" }}>—</span>}
                  </td>
                  <td style={{ padding: ".65rem .75rem", textAlign: "right", color: "#1d1d1f" }}>{c.donationCount}</td>
                  <td style={{ padding: ".65rem .75rem", textAlign: "right", color: "#1d1d1f" }}>{c.athleteCount}</td>
                  <td style={{ padding: ".65rem .75rem", textAlign: "right", color: "#1d1d1f" }}>
                    {c.athleteAccounts > 0 ? <span style={{ color: "#15803d", fontWeight: 600 }}>{c.athleteAccounts}</span> : <span style={{ color: "#9ca3af" }}>0</span>}
                  </td>
                  <td style={{ padding: ".65rem .75rem", textAlign: "right" }}>
                    <span style={{ color: c.contactsCollected > 0 ? "#15803d" : "#9ca3af", fontWeight: c.contactsCollected > 0 ? 600 : 400 }}>{c.contactsCollected}</span>
                    {c.totalContactGoal > 0 && <span style={{ color: "#c7c7cc", fontSize: ".68rem" }}>/{c.totalContactGoal}</span>}
                  </td>
                  <td style={{ padding: ".65rem .75rem" }}>
                    {c.athleteCount > 0 ? (
                      <div style={{ display: "flex", alignItems: "center", gap: ".4rem", minWidth: 72 }}>
                        <MiniBar pct={c.adoptionPct} color="#1d4ed8" />
                        <span style={{ fontSize: ".68rem", color: "#6e6e73", whiteSpace: "nowrap" }}>{c.adoptionPct}%</span>
                      </div>
                    ) : <span style={{ color: "#c7c7cc" }}>—</span>}
                  </td>
                  <td style={{ padding: ".65rem .75rem", color: "#6e6e73", whiteSpace: "nowrap", fontSize: ".75rem" }}>{fmtDate(c.deadline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── 3 + 4. Fundraising & Contact analytics — two columns ──────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>

        {/* Top campaigns by raised */}
        <div style={T.card}>
          <h2 style={T.sectionTitle}>Top Campaigns by Raised</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: ".65rem" }}>
            {d.campaigns.filter(c => c.raisedCents > 0).slice(0, 6).map((c, i) => {
              const maxRaised = d.campaigns[0]?.raisedCents || 1;
              return (
                <div key={c.slug}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ".25rem" }}>
                    <span style={{ fontSize: ".8rem", color: "#1d1d1f", fontWeight: 500 }}>
                      <span style={{ color: "#c7c7cc", fontWeight: 700, marginRight: ".4rem", fontSize: ".72rem" }}>#{i + 1}</span>
                      {c.name}
                    </span>
                    <span style={{ fontSize: ".8rem", fontWeight: 700, color: "#1d1d1f" }}>{fmtFull$(c.raisedCents)}</span>
                  </div>
                  <MiniBar pct={Math.round((c.raisedCents / maxRaised) * 100)} color={c.primaryColor || "#0b1e3d"} height={5} />
                </div>
              );
            })}
            {d.campaigns.every(c => c.raisedCents === 0) && <div style={T.muted}>No donations yet.</div>}
          </div>
        </div>

        {/* Top athletes by raised */}
        <div style={T.card}>
          <h2 style={T.sectionTitle}>Top Athletes by Raised</h2>
          {d.topAthletes.length === 0
            ? <div style={T.muted}>No athlete-linked donations yet.</div>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                {d.topAthletes.slice(0, 8).map((a, i) => {
                  const max = d.topAthletes[0]?.raisedCents || 1;
                  return (
                    <div key={a.id}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ".2rem" }}>
                        <span style={{ fontSize: ".78rem", color: "#1d1d1f" }}>
                          <span style={{ color: "#c7c7cc", fontWeight: 700, marginRight: ".35rem", fontSize: ".68rem" }}>#{i + 1}</span>
                          <span style={{ fontWeight: 500 }}>{a.name}</span>
                          <span style={{ ...T.muted, marginLeft: ".4rem" }}>{a.campaign.split("-").slice(0, 2).join(" ")}</span>
                        </span>
                        <span style={{ fontSize: ".78rem", fontWeight: 700, color: "#15803d" }}>{fmtFull$(a.raisedCents)}</span>
                      </div>
                      <MiniBar pct={Math.round((a.raisedCents / max) * 100)} color="#16a34a" height={4} />
                    </div>
                  );
                })}
              </div>
            )
          }
        </div>

        {/* Average donation by campaign */}
        <div style={T.card}>
          <h2 style={T.sectionTitle}>Avg Donation by Campaign</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
            {d.campaigns.filter(c => c.donationCount > 0).map(c => (
              <div key={c.slug} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".45rem 0", borderBottom: "1px solid #f5f5f7" }}>
                <div>
                  <div style={{ fontSize: ".78rem", fontWeight: 500, color: "#1d1d1f" }}>{c.name}</div>
                  <div style={{ fontSize: ".65rem", color: "#98989d" }}>{c.donationCount} donation{c.donationCount !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ fontSize: ".9rem", fontWeight: 700, color: "#1d1d1f" }}>{fmtFull$(c.avgDonationCents)}</div>
              </div>
            ))}
            {d.campaigns.every(c => c.donationCount === 0) && <div style={T.muted}>No donations yet.</div>}
          </div>
        </div>

        {/* Recent donation activity */}
        <div style={T.card}>
          <h2 style={T.sectionTitle}>Recent Donation Activity</h2>
          {d.recentDonations.length === 0
            ? <div style={T.muted}>No donations yet.</div>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {d.recentDonations.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".45rem 0", borderBottom: i < d.recentDonations.length - 1 ? "1px solid #f5f5f7" : "none" }}>
                    <div>
                      <div style={{ fontSize: ".78rem", fontWeight: 500, color: "#1d1d1f" }}>{r.athlete}</div>
                      <div style={{ fontSize: ".65rem", color: "#98989d" }}>{r.campaign.split("-").slice(0, 3).join(" ")} · {fmtDate(r.date)}</div>
                    </div>
                    <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#15803d" }}>{fmt$(r.cents)}</div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* ── 4. Contact Analytics ──────────────────────────────────────── */}
      <SectionCard title="Contact Analytics">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
          {[
            { label: "Contacts Collected", value: d.contactsCollected, color: d.contactsCollected > 0 ? "#15803d" : "#9ca3af" },
            { label: "Athletes at Goal",   value: d.athletesAtGoal,           color: "#15803d" },
            { label: "Zero Contacts",      value: d.athletesWithZeroContacts,  color: d.athletesWithZeroContacts > 0 ? "#dc2626" : "#15803d" },
            { label: "Total Athletes",     value: d.totalAthletes,             color: "#1d1d1f" },
          ].map(s => (
            <div key={s.label} style={{ background: "#fafafa", borderRadius: 10, padding: ".85rem 1rem" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: s.color, letterSpacing: "-.02em", lineHeight: 1 }}>{s.value}</div>
              <div style={{ ...T.label, marginTop: ".35rem" }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ ...T.label, marginBottom: ".65rem" }}>Contact completion by campaign</div>
          {d.campaigns.map(c => (
            <div key={c.slug} style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: ".6rem" }}>
              <div style={{ width: 160, fontSize: ".75rem", color: "#1d1d1f", fontWeight: 500, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
              <MiniBar pct={c.contactCompletionPct} color="#0369a1" height={6} />
              <span style={{ fontSize: ".7rem", color: "#6e6e73", whiteSpace: "nowrap", width: 52, textAlign: "right" }}>
                {c.contactsCollected}/{c.totalContactGoal > 0 ? c.totalContactGoal : "?"}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── 5. User Adoption Analytics ────────────────────────────────── */}
      <SectionCard title="User Adoption Analytics">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>

          <div>
            <AdoptionBar
              label="Athlete account adoption (of roster)"
              value={d.athleteAccounts}
              total={d.totalAthletes}
              color="#1d4ed8"
            />
            <AdoptionBar
              label="Athlete accounts (of members registered)"
              value={d.athleteAccounts}
              total={d.totalAthleteMembers}
              color="#3b82f6"
            />
            <AdoptionBar
              label="Parent link rate (of roster athletes)"
              value={d.parentLinksTotal}
              total={d.totalAthletes}
              color="#7e22ce"
            />
            <AdoptionBar
              label="Coaches/boosters with accounts"
              value={d.coachAccounts}
              total={6}
              color="#0369a1"
            />
          </div>

          <div>
            <div style={{ ...T.label, marginBottom: ".85rem" }}>Active accounts by role</div>
            {Object.entries(d.accountsByRole)
              .sort((a, b) => b[1] - a[1])
              .map(([role, count]) => (
                <div key={role} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".45rem 0", borderBottom: "1px solid #f5f5f7" }}>
                  <span style={{ fontSize: ".8rem", color: "#1d1d1f", fontWeight: 500 }}>{ROLE_LABELS[role] ?? role}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                    <div style={{ width: 60, height: 5, background: "#f0f0f2", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: count > 0 ? "100%" : "0%", background: "#0b1e3d" }} />
                    </div>
                    <span style={{ fontSize: ".78rem", fontWeight: 700, color: "#1d1d1f", width: 12, textAlign: "right" }}>{count}</span>
                  </div>
                </div>
              ))
            }
            <div style={{ marginTop: ".85rem", padding: ".65rem .85rem", background: "#f5f5f7", borderRadius: 8 }}>
              <div style={{ fontSize: ".68rem", color: "#98989d", fontWeight: 500 }}>
                Total active accounts across all roles: <strong style={{ color: "#1d1d1f" }}>{d.totalAccounts}</strong>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  head_coach: "Head Coaches", assistant_coach: "Asst. Coaches",
  booster: "Boosters", athlete: "Athletes", parent: "Parents",
};
