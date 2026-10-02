"use client";

import { useRouter } from "next/navigation";
import type { AttentionItem } from "@/lib/platform/operations";
import type { CrmPipelineSummary } from "@/lib/platform/crm";
import type { SponsorSummary } from "@/lib/platform/sponsors";
import type { DonationMomentum } from "@/lib/platform/donations";

type NotificationHealth = {
  queued:              number;
  failed:              number;
  deliverySuccessRate: number | null;
};

type Props = {
  attention:  AttentionItem[];
  alertCount: number;

  totalCampaigns:   number;
  activeCampaigns:  number;
  totalDonations:   number;
  totalRaisedCents: number;
  totalAthletes:    number;
  totalMembers:     number;
  totalContacts:    number;

  momentum7:                      DonationMomentum;
  momentum30:                     DonationMomentum;
  forecastableCount:              number;
  likelyToHitGoal:                number;
  projectedPlatformRevenueCents:  number;
  pipelineSummary:                CrmPipelineSummary;
  sponsorSummary:                 SponsorSummary;
  notificationHealth:             NotificationHealth;
};

function fmt$(cents: number) {
  if (cents >= 100000000) return `$${(cents / 100000000).toFixed(1)}M`;
  if (cents >= 100000)    return `$${(cents / 100000).toFixed(0)}k`;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtN(n: number) {
  return n.toLocaleString("en-US");
}

// ── Needs Attention ─────────────────────────────────────────────────────────────
// Same severity palette Operations already uses for AttentionItem, reused
// here rather than redefined with different colors — this is just a color
// token map, not a second copy of the attention-computation logic (which
// stays exclusively in getNeedsAttention()).
const SEV = {
  critical: { bg: "#fff1f2", border: "#fca5a5", accent: "#dc2626", text: "#991b1b" },
  warning:  { bg: "#fffbeb", border: "#fcd34d", accent: "#d97706", text: "#92400e" },
  info:     { bg: "#eff6ff", border: "#93c5fd", accent: "#2563eb", text: "#1e40af" },
  ok:       { bg: "#f0fdf4", border: "#86efac", accent: "#16a34a", text: "#166534" },
} as const;

// Dashboard stays concise by default — only the top few items, ranked
// critical-first, with a link to Operations for the full list rather than
// reproducing every alert here.
const SEVERITY_RANK: Record<AttentionItem["severity"], number> = { critical: 0, warning: 1, info: 2, ok: 3 };
const MAX_VISIBLE_ATTENTION = 5;

function NeedsAttentionRow({ item }: { item: AttentionItem }) {
  const c = SEV[item.severity];
  return (
    <a
      href={item.href ?? "#"}
      style={{
        display: "flex", alignItems: "center", gap: ".85rem",
        padding: ".75rem .9rem",
        background: c.bg, border: `1px solid ${c.border}`, borderLeft: `3px solid ${c.accent}`,
        borderRadius: 9, textDecoration: "none",
      }}
    >
      <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{item.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: ".8rem", fontWeight: 600, color: c.text }}>
          {item.title}
          {item.count !== undefined && <span style={{ color: c.accent }}> · {item.count}</span>}
        </div>
        {item.detail && (
          <div style={{ fontSize: ".72rem", color: "#64748b", marginTop: ".1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.detail}
          </div>
        )}
      </div>
      {item.actionLabel && (
        <span style={{ fontSize: ".72rem", fontWeight: 600, color: c.accent, flexShrink: 0, whiteSpace: "nowrap" }}>
          {item.actionLabel} →
        </span>
      )}
    </a>
  );
}

function NeedsAttentionSection({ attention, alertCount }: { attention: AttentionItem[]; alertCount: number }) {
  const router = useRouter();
  const sorted  = [...attention].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const visible = sorted.slice(0, MAX_VISIBLE_ATTENTION);
  const hiddenCount = sorted.length - visible.length;

  return (
    <div style={{ marginBottom: "1.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".65rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <span style={{ fontSize: ".85rem", fontWeight: 700, color: "#1d1d1f" }}>Needs Attention</span>
          {alertCount > 0 && (
            <span style={{
              fontSize: ".68rem", fontWeight: 700, color: "#dc2626", background: "#fff1f2",
              border: "1px solid #fca5a5", borderRadius: 100, padding: ".05rem .5rem",
            }}>
              {alertCount}
            </span>
          )}
        </div>
        <button
          onClick={() => router.push("/admin/operations")}
          style={{ fontSize: ".72rem", fontWeight: 600, color: "#0b1e3d", background: "none", border: "none", cursor: "pointer" }}
        >
          Open Operations →
        </button>
      </div>

      {visible.length === 0 ? (
        <div style={{
          background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10,
          padding: ".9rem 1.1rem", fontSize: ".8rem", color: "#166534", fontWeight: 600,
        }}>
          ✓ Nothing needs attention right now.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
          {visible.map(item => <NeedsAttentionRow key={item.id} item={item} />)}
          {hiddenCount > 0 && (
            <button
              onClick={() => router.push("/admin/operations")}
              style={{ alignSelf: "flex-start", fontSize: ".72rem", fontWeight: 600, color: "#6e6e73", background: "none", border: "none", cursor: "pointer", padding: ".25rem .2rem" }}
            >
              +{hiddenCount} more in Operations →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Platform Snapshot ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "1.1rem 1.3rem", border: "1px solid #f0f0f2", display: "flex", flexDirection: "column", gap: ".3rem" }}>
      <div style={{ fontSize: ".68rem", fontWeight: 600, color: "#98989d", textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.02em", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: ".7rem", color: "#98989d", fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

// ── Business / Platform Insights ─────────────────────────────────────────────────

function InsightCard({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #f0f0f2", padding: "1.1rem 1.3rem", display: "flex", flexDirection: "column", gap: ".55rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#1d1d1f", textTransform: "uppercase", letterSpacing: ".05em" }}>{title}</span>
        {href && (
          <a href={href} style={{ fontSize: ".68rem", fontWeight: 600, color: "#0b1e3d", textDecoration: "none" }}>
            View →
          </a>
        )}
      </div>
      {children}
    </div>
  );
}

function InsightStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ fontSize: ".76rem", color: "#6e6e73" }}>{label}</span>
      <span style={{ fontSize: ".82rem", fontWeight: 700, color: "#1d1d1f" }}>{value}</span>
    </div>
  );
}

// ── Quick actions ─────────────────────────────────────────────────────────────────

type QuickAction = { label: string; desc: string; href: string; primary?: boolean };

const ACTIONS: QuickAction[] = [
  { label: "View Campaigns",         desc: "See all campaigns and their status",     href: "/admin/campaigns", primary: true },
  { label: "Create / Manage Campaign", desc: "Edit settings, roster, coaches",        href: "/admin/edit" },
  { label: "Review Leads",           desc: "New demo requests and CRM follow-ups",   href: "/admin/crm" },
  { label: "Open Demo Environment",  desc: "Explore the sales demo environment",     href: "/admin/demo" },
];

export default function DashboardView({
  attention, alertCount,
  totalCampaigns, activeCampaigns, totalDonations, totalRaisedCents,
  totalAthletes, totalMembers, totalContacts,
  momentum7, momentum30, forecastableCount, likelyToHitGoal, projectedPlatformRevenueCents,
  pipelineSummary, sponsorSummary, notificationHealth,
}: Props) {
  const router = useRouter();

  return (
    <div style={{ padding: "1.75rem 2rem", maxWidth: 1180 }}>

      {/* A — Needs Attention */}
      <NeedsAttentionSection attention={attention} alertCount={alertCount} />

      {/* B — Platform Snapshot */}
      <div style={{ marginBottom: ".5rem" }}>
        <div style={{ fontSize: ".72rem", fontWeight: 600, color: "#98989d", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".65rem" }}>
          Platform Snapshot
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: ".9rem", marginBottom: "1.75rem" }}>
          <KpiCard label="Active Campaigns" value={String(activeCampaigns)} sub={`${totalCampaigns} total`} />
          <KpiCard label="Total Raised"     value={fmt$(totalRaisedCents)} sub="all campaigns" />
          <KpiCard label="Donations"        value={fmtN(totalDonations)} />
          <KpiCard label="Athletes"         value={fmtN(totalAthletes)} />
          <KpiCard label="Members"          value={fmtN(totalMembers)} />
          <KpiCard label="Contacts"         value={fmtN(totalContacts)} />
        </div>
      </div>

      {/* C — Business / Platform Insights */}
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ fontSize: ".72rem", fontWeight: 600, color: "#98989d", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".65rem" }}>
          Business &amp; Platform Insights
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: ".9rem" }}>

          <InsightCard title="Donation Momentum" href="/admin/reports">
            <InsightStat label="Last 7 days"  value={`${fmt$(momentum7.cents)} · ${momentum7.count} gift${momentum7.count === 1 ? "" : "s"}`} />
            <InsightStat label="Last 30 days" value={`${fmt$(momentum30.cents)} · ${momentum30.count} gift${momentum30.count === 1 ? "" : "s"}`} />
          </InsightCard>

          {forecastableCount > 0 && (
            <InsightCard title="Revenue Forecast" href="/admin/executive">
              <InsightStat label="Projected to hit goal" value={`${likelyToHitGoal} of ${forecastableCount}`} />
              <InsightStat label="Projected ELF revenue" value={fmt$(projectedPlatformRevenueCents)} />
            </InsightCard>
          )}

          <InsightCard title="CRM Pipeline" href="/admin/crm">
            <InsightStat label="Open prospects"  value={fmtN(pipelineSummary.openProspects)} />
            <InsightStat label="Demos scheduled" value={fmtN(pipelineSummary.demosScheduled)} />
            <InsightStat label="Follow-ups due"  value={fmtN(pipelineSummary.followUpsDue)} />
          </InsightCard>

          <InsightCard title="Sponsors" href="/admin/sponsors">
            <InsightStat label="Businesses"       value={fmtN(sponsorSummary.totalBusinesses)} />
            <InsightStat label="Lifetime value"   value={fmt$(sponsorSummary.lifetimeValueCents)} />
            <InsightStat label="Renewals due"     value={fmtN(sponsorSummary.renewalsDue)} />
          </InsightCard>

          <InsightCard title="Platform Health" href="/admin/notifications">
            <InsightStat label="Notifications queued" value={fmtN(notificationHealth.queued)} />
            <InsightStat
              label="Delivery success rate"
              value={notificationHealth.deliverySuccessRate !== null ? `${notificationHealth.deliverySuccessRate}%` : "—"}
            />
          </InsightCard>

        </div>
      </div>

      {/* Quick actions */}
      <div>
        <div style={{ fontSize: ".72rem", fontWeight: 600, color: "#98989d", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".75rem" }}>Quick Actions</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: ".875rem" }}>
          {ACTIONS.map(a => (
            <button
              key={a.label}
              onClick={() => router.push(a.href)}
              style={{
                background: a.primary ? "#0b1e3d" : "#fff",
                border: a.primary ? "none" : "1px solid #e5e7eb",
                borderRadius: 12,
                padding: "1rem 1.25rem",
                cursor: "pointer",
                textAlign: "left",
                transition: "transform .1s, box-shadow .1s",
                outline: "none",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(0,0,0,.08)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
              onFocus={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = a.primary ? "0 0 0 3px rgba(11,30,61,.3)" : "0 0 0 3px rgba(11,30,61,.15)"; }}
              onBlur={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
            >
              <div style={{ fontSize: ".875rem", fontWeight: 600, color: a.primary ? "#fff" : "#1d1d1f", marginBottom: ".25rem" }}>{a.label}</div>
              <div style={{ fontSize: ".75rem", color: a.primary ? "rgba(255,255,255,.6)" : "#98989d" }}>{a.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
