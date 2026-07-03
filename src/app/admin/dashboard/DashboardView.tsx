"use client";

import { useRouter } from "next/navigation";

type Props = {
  totalCampaigns:   number;
  activeCampaigns:  number;
  totalDonations:   number;
  totalRaisedCents: number;
  totalAthletes:    number;
  totalMembers:     number;
  totalContacts:    number;
};

function fmt$(cents: number) {
  if (cents >= 100000000) return `$${(cents / 100000000).toFixed(1)}M`;
  if (cents >= 100000)    return `$${(cents / 100000).toFixed(0)}k`;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtN(n: number) {
  return n.toLocaleString("en-US");
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "1.25rem 1.5rem", border: "1px solid #f0f0f2", display: "flex", flexDirection: "column", gap: ".3rem" }}>
      <div style={{ fontSize: ".7rem", fontWeight: 600, color: "#98989d", textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
      <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.02em", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: ".72rem", color: "#98989d", fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

type QuickAction = { label: string; desc: string; href: string; primary?: boolean };

const ACTIONS: QuickAction[] = [
  { label: "View Campaigns",     desc: "See all campaigns and their status", href: "/admin/campaigns", primary: true },
  { label: "Campaign Editor",    desc: "Edit settings, roster, coaches",      href: "/admin/edit" },
  { label: "Demo Center",        desc: "Explore the sales demo environment", href: "/admin/demo" },
  { label: "Export Reports",     desc: "Download campaign data as CSV",       href: "/admin/exports" },
];

export default function DashboardView({
  totalCampaigns, activeCampaigns, totalDonations, totalRaisedCents,
  totalAthletes, totalMembers, totalContacts,
}: Props) {
  const router = useRouter();

  return (
    <div style={{ padding: "1.75rem 2rem", maxWidth: 1100 }}>

      {/* KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <KpiCard label="Active Campaigns"  value={String(activeCampaigns)}  sub={`${totalCampaigns} total`} />
        <KpiCard label="Total Raised"      value={fmt$(totalRaisedCents)}   sub="all campaigns" />
        <KpiCard label="Total Donations"   value={fmtN(totalDonations)}     />
        <KpiCard label="Avg Donation"      value={totalDonations > 0 ? fmt$(Math.round(totalRaisedCents / totalDonations)) : "$0"} />
        <KpiCard label="Total Athletes"    value={fmtN(totalAthletes)}      />
        <KpiCard label="Member Accounts"   value={fmtN(totalMembers)}       />
        <KpiCard label="Contacts Collected" value={fmtN(totalContacts)}     />
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: ".75rem" }}>
        <div style={{ fontSize: ".72rem", fontWeight: 600, color: "#98989d", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".75rem" }}>Quick Actions</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: ".875rem" }}>
          {ACTIONS.map(a => (
            <button
              key={a.label}
              onClick={() => { if (a.href !== "#") router.push(a.href); }}
              style={{
                background: a.primary ? "#0b1e3d" : "#fff",
                border: a.primary ? "none" : "1px solid #e5e7eb",
                borderRadius: 12,
                padding: "1rem 1.25rem",
                cursor: a.href === "#" ? "default" : "pointer",
                textAlign: "left",
                opacity: a.href === "#" ? .5 : 1,
                transition: "transform .1s, box-shadow .1s",
                outline: "none",
              }}
              onMouseEnter={e => { if (a.href !== "#") { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(0,0,0,.08)"; } }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
              onFocus={e => { if (a.href !== "#") { (e.currentTarget as HTMLButtonElement).style.boxShadow = a.primary ? "0 0 0 3px rgba(11,30,61,.3)" : "0 0 0 3px rgba(11,30,61,.15)"; } }}
              onBlur={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
            >
              <div style={{ fontSize: ".875rem", fontWeight: 600, color: a.primary ? "#fff" : "#1d1d1f", marginBottom: ".25rem" }}>{a.label}</div>
              <div style={{ fontSize: ".75rem", color: a.primary ? "rgba(255,255,255,.6)" : "#98989d" }}>{a.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Campaigns summary row */}
      <div style={{ marginTop: "2rem", background: "#fff", borderRadius: 14, border: "1px solid #f0f0f2", overflow: "hidden" }}>
        <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: ".78rem", fontWeight: 600, color: "#1d1d1f" }}>Overview</span>
          <button onClick={() => router.push("/admin/campaigns")}
            style={{ fontSize: ".72rem", fontWeight: 600, color: "#0b1e3d", background: "none", border: "none", cursor: "pointer", textDecoration: "none" }}>
            View all campaigns →
          </button>
        </div>
        <div style={{ padding: "1rem 1.5rem", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem" }}>
          {[
            { label: "Active", value: activeCampaigns, color: "#15803d", bg: "#dcfce7" },
            { label: "Archived", value: totalCampaigns - activeCampaigns, color: "#6b7280", bg: "#f3f4f6" },
            { label: "Total", value: totalCampaigns, color: "#0b1e3d", bg: "#eff0f3" },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: item.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".85rem", fontWeight: 700, color: item.color, flexShrink: 0 }}>
                {item.value}
              </div>
              <div style={{ fontSize: ".78rem", color: "#6e6e73", fontWeight: 500 }}>{item.label} campaigns</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
