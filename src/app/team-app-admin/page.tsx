"use client";

import Link from "next/link";
import { useAppStore } from "../_store/AppStore";

const quickLinks = [
  { label: "Compose Update",  href: "/team-app-admin/updates",      desc: "Post announcement",   color: "#0369A1" },
  { label: "Add Athlete",     href: "/team-app-admin/roster",       desc: "Expand the roster",   color: "#0B1E3D" },
  { label: "Add Event",       href: "/team-app-admin/calendar",     desc: "Schedule a date",     color: "#1A3A5C" },
  { label: "Edit Shop",       href: "/team-app-admin/shop",         desc: "Manage products",     color: "#C9A84C" },
  { label: "Team Profile",    href: "/team-app-admin/team-profile", desc: "Colors & branding",   color: "#5B21B6" },
  { label: "Sponsors",        href: "/team-app-admin/sponsors",     desc: "Manage partners",     color: "#374151" },
];

export default function AdminOverviewPage() {
  const { teamInfo, athletes, calendarEvents, fundraisingData, teamUpdates } = useAppStore();

  const raisedPct = Math.round((fundraisingData.raised / fundraisingData.goal) * 100);

  const stats = [
    {
      label: "Athletes",
      value: athletes.length,
      sub: `${teamInfo.sport} · ${teamInfo.season}`,
      color: "#0B1E3D",
      href: "/team-app-admin/roster",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </svg>
      ),
    },
    {
      label: "Scheduled Events",
      value: calendarEvents.length,
      sub: calendarEvents[0] ? `Next: ${calendarEvents[0].title}` : "No events scheduled",
      color: "#1A3A5C",
      href: "/team-app-admin/calendar",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      label: "Fundraiser",
      value: `$${fundraisingData.raised.toLocaleString()}`,
      sub: `${raisedPct}% of $${fundraisingData.goal.toLocaleString()} goal`,
      color: "#92700A",
      href: "/team-app-admin/fundraiser",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v1m0 8v1M9.5 9.5c0-1.1.9-2 2.5-2s2.5.9 2.5 2-1 1.8-2.5 2-2.5 1-2.5 2 .9 2 2.5 2 2.5-.9 2.5-2" />
        </svg>
      ),
    },
    {
      label: "Team Updates",
      value: teamUpdates.length,
      sub: `${teamUpdates.filter(u => !u.read).length} unread by athletes`,
      color: "#0369A1",
      href: "/team-app-admin/updates",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 010 7.07" />
        </svg>
      ),
    },
  ];

  return (
    <div className="ta-adm-page">
      {/* Page header */}
      <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid #E8E4DC", background: "#FFFFFF" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0A0A0A" }}>
              {teamInfo.shortName} {teamInfo.mascot}
            </h1>
            <p style={{ fontSize: 14, color: "#6B7280", marginTop: 3 }}>
              {teamInfo.sport} &middot; {teamInfo.season} &middot; Team App Admin
            </p>
          </div>
          <Link
            href="/team-app/home"
            target="_blank"
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 18px", borderRadius: 10,
              background: "#0B1E3D", color: "#FFFFFF",
              textDecoration: "none", fontSize: 13, fontWeight: 600,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Preview App
          </Link>
        </div>
      </div>

      <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 28 }}>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {stats.map((s) => (
            <Link key={s.label} href={s.href} style={{ textDecoration: "none" }}>
              <div className="ta-adm-stat-card">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: `${s.color}14`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: s.color,
                  }}>
                    {s.icon}
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4BEB6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
                <p style={{ fontSize: 24, fontWeight: 900, color: "#0A0A0A", lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginTop: 4 }}>{s.label}</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3, lineHeight: 1.4 }}>{s.sub}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Fundraiser progress bar */}
        <div className="ta-adm-card" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#0A0A0A" }}>
              {fundraisingData.campaignName}
            </p>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#C9A84C" }}>{raisedPct}%</p>
          </div>
          <div style={{ height: 8, borderRadius: 8, background: "#EDE9E3", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${raisedPct}%`, background: "linear-gradient(90deg, #C9A84C, #E0AA35)", borderRadius: 8, transition: "width 0.6s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <p style={{ fontSize: 12, color: "#6B7280" }}>${fundraisingData.raised.toLocaleString()} raised &middot; {fundraisingData.donors} donors</p>
            <p style={{ fontSize: 12, color: "#9CA3AF" }}>{fundraisingData.daysLeft} days left &middot; Goal: ${fundraisingData.goal.toLocaleString()}</p>
          </div>
        </div>

        {/* Two-column: Quick Actions + Upcoming Events */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* Quick Actions */}
          <div className="ta-adm-card" style={{ padding: "20px 22px" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#0A0A0A", marginBottom: 14 }}>Quick Actions</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {quickLinks.map((q) => (
                <Link
                  key={q.label}
                  href={q.href}
                  style={{
                    display: "flex", flexDirection: "column", gap: 3,
                    padding: "12px 14px", borderRadius: 10,
                    background: "#F9F8F6", textDecoration: "none",
                    border: "1.5px solid #EDE9E3",
                    transition: "border-color 0.15s ease",
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#0A0A0A" }}>{q.label}</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF" }}>{q.desc}</p>
                </Link>
              ))}
            </div>
          </div>

          {/* Upcoming Events */}
          <div className="ta-adm-card" style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#0A0A0A" }}>Upcoming Events</p>
              <Link href="/team-app-admin/calendar" style={{ fontSize: 12, fontWeight: 600, color: "#C9A84C", textDecoration: "none" }}>
                See all
              </Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {calendarEvents.slice(0, 5).map((e, i) => {
                const typeColors: Record<string, string> = { game: "#1A3A5C", practice: "#6B7280", fundraiser: "#C9A84C", team: "#0B1E3D" };
                const color = typeColors[e.type] || "#6B7280";
                return (
                  <div
                    key={e.id}
                    className="ta-adm-row"
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "9px 0",
                      borderBottom: i < Math.min(calendarEvents.length, 5) - 1 ? "1px solid #F0EDE8" : "none",
                    }}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#0A0A0A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF" }}>{e.date} &middot; {e.time}</p>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                      background: `${color}14`, color,
                      textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
                    }}>
                      {e.type}
                    </span>
                  </div>
                );
              })}
              {calendarEvents.length === 0 && (
                <p style={{ fontSize: 13, color: "#9CA3AF" }}>No events scheduled.</p>
              )}
            </div>
          </div>
        </div>

        {/* Recent Updates */}
        <div className="ta-adm-card" style={{ padding: "20px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#0A0A0A" }}>Recent Updates</p>
            <Link href="/team-app-admin/updates" style={{ fontSize: 12, fontWeight: 600, color: "#C9A84C", textDecoration: "none" }}>
              Manage
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {teamUpdates.slice(0, 4).map((u, i) => {
              const catColors: Record<string, string> = { schedule: "#1A3A5C", fundraiser: "#C9A84C", travel: "#7C3AED", "meet-info": "#0369A1", "team-alert": "#DC2626" };
              const color = catColors[u.category] || "#6B7280";
              return (
                <div
                  key={u.id}
                  className="ta-adm-row"
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                    borderBottom: i < Math.min(teamUpdates.length, 4) - 1 ? "1px solid #F0EDE8" : "none",
                  }}
                >
                  {!u.read && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0369A1", flexShrink: 0 }} />}
                  {u.read  && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#E5E7EB", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: u.read ? 500 : 700, color: "#0A0A0A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.title}
                    </p>
                    <p style={{ fontSize: 11, color: "#9CA3AF" }}>{u.author} &middot; {u.timestamp}</p>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                    background: `${color}14`, color,
                    textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
                  }}>
                    {u.category}
                  </span>
                </div>
              );
            })}
            {teamUpdates.length === 0 && (
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>No updates yet.</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
