"use client";

import { useRouter } from "next/navigation";
import type {
  OperationsData,
  AttentionItem,
  TodayStat,
  AuditEntry,
  PlatformService,
  PendingCategory,
} from "./types";

type Props = { data: OperationsData };

// ── Severity colour map ────────────────────────────────────────────────────────
const SEV = {
  critical: { bg: "#fff1f2", border: "#fca5a5", accent: "#dc2626", text: "#991b1b" },
  warning:  { bg: "#fffbeb", border: "#fcd34d", accent: "#d97706", text: "#92400e" },
  info:     { bg: "#eff6ff", border: "#93c5fd", accent: "#2563eb", text: "#1e40af" },
  ok:       { bg: "#f0fdf4", border: "#86efac", accent: "#16a34a", text: "#166534" },
} as const;

// ── Audit-log badge colours (mirrors AuditView) ────────────────────────────────
const BADGE: Record<string, { bg: string; color: string }> = {
  campaign: { bg: "#dbeafe", color: "#1e40af" },
  athlete:  { bg: "#ede9fe", color: "#6d28d9" },
  coach:    { bg: "#d1fae5", color: "#065f46" },
  sponsor:  { bg: "#fef3c7", color: "#92400e" },
  export:   { bg: "#f3f4f6", color: "#374151" },
  demo:     { bg: "#ecfdf5", color: "#047857" },
};
function badge(action: string) {
  const kind = action.split(".")[0];
  return BADGE[kind] ?? { bg: "#f3f4f6", color: "#374151" };
}
function badgeLabel(action: string) {
  return action.split(".")[0].slice(0, 3).toUpperCase();
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function AttentionCard({ item }: { item: AttentionItem }) {
  const c = SEV[item.severity];
  return (
    <div style={{
      background:  c.bg,
      border:      `1px solid ${c.border}`,
      borderLeft:  `4px solid ${c.accent}`,
      borderRadius: 10,
      padding:     "1rem 1.1rem",
      display:     "flex",
      flexDirection: "column",
      gap:         ".4rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
        <span style={{ fontSize: "1rem" }}>{item.icon}</span>
        <span style={{ fontSize: ".78rem", fontWeight: 600, color: c.text }}>{item.title}</span>
      </div>
      {item.count !== undefined && (
        <div style={{ fontSize: "2rem", fontWeight: 700, color: c.accent, lineHeight: 1, margin: ".1rem 0" }}>
          {item.count}
        </div>
      )}
      {item.detail && (
        <div style={{ fontSize: ".72rem", color: "#64748b", lineHeight: 1.4 }}>{item.detail}</div>
      )}
      {item.href && item.actionLabel && (
        <a href={item.href} style={{
          display:     "inline-block",
          marginTop:   ".25rem",
          fontSize:    ".72rem",
          fontWeight:  600,
          color:       c.accent,
          textDecoration: "none",
        }}>
          {item.actionLabel} →
        </a>
      )}
    </div>
  );
}

function StatCard({ stat }: { stat: TodayStat }) {
  const inner = (
    <div style={{
      background:   "#fff",
      border:       "1px solid #e5e7eb",
      borderRadius: 10,
      padding:      "1rem 1.1rem",
      cursor:       stat.href ? "pointer" : "default",
    }}>
      <div style={{ fontSize: "1.1rem", marginBottom: ".35rem" }}>{stat.icon}</div>
      <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#1d1d1f", lineHeight: 1 }}>
        {stat.value.toLocaleString()}
      </div>
      {stat.sublabel && (
        <div style={{ fontSize: ".68rem", color: "#16a34a", fontWeight: 600, marginTop: ".15rem" }}>
          {stat.sublabel}
        </div>
      )}
      <div style={{ fontSize: ".73rem", color: "#6e6e73", marginTop: ".35rem", fontWeight: 500 }}>
        {stat.label}
      </div>
    </div>
  );

  if (stat.href) {
    return (
      <a href={stat.href} style={{ textDecoration: "none", display: "block" }}>
        {inner}
      </a>
    );
  }
  return inner;
}

function ActivityRow({ event }: { event: AuditEntry }) {
  const b = badge(event.action);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".6rem 0", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{
        width: 30, height: 30, background: b.bg, borderRadius: 6,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <span style={{ fontSize: ".6rem", fontWeight: 700, color: b.color }}>{badgeLabel(event.action)}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: ".78rem", fontWeight: 500, color: "#1d1d1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {event.summary ?? event.action}
        </div>
        <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: ".1rem" }}>
          {event.campaign_slug ?? "system"} · {relativeTime(event.created_at)}
        </div>
      </div>
    </div>
  );
}

function PlatformRow({ service }: { service: PlatformService }) {
  const dotColor = service.status === "operational" ? "#16a34a"
    : service.status === "unknown"      ? "#d97706"
    : "#94a3b8";
  const statusLabel = service.status === "operational" ? "Operational"
    : service.status === "unknown"      ? "Unknown"
    : "Unconfigured";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".6rem", padding: ".55rem 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ fontSize: ".85rem", width: 20, textAlign: "center", flexShrink: 0 }}>{service.icon}</span>
      <span style={{ flex: 1, fontSize: ".78rem", fontWeight: 500, color: "#1d1d1f" }}>{service.name}</span>
      <div style={{ display: "flex", alignItems: "center", gap: ".35rem" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: ".7rem", color: dotColor, fontWeight: 600 }}>{statusLabel}</span>
      </div>
    </div>
  );
}

function PendingRow({ item }: { item: PendingCategory }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".55rem 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ fontSize: ".78rem", color: "#374151", fontWeight: 500 }}>{item.label}</span>
      <span style={{ fontSize: ".78rem", color: item.count > 0 ? "#dc2626" : "#94a3b8", fontWeight: 600, background: item.count > 0 ? "#fee2e2" : "#f3f4f6", padding: ".1rem .5rem", borderRadius: 12, minWidth: 28, textAlign: "center" }}>
        {item.count}
      </span>
    </div>
  );
}

// ── Section heading style ──────────────────────────────────────────────────────
const sectionLabel: React.CSSProperties = {
  fontSize:      ".68rem",
  fontWeight:    700,
  color:         "#94a3b8",
  letterSpacing: ".08em",
  textTransform: "uppercase",
  marginBottom:  ".75rem",
};

// ── Main component ─────────────────────────────────────────────────────────────
export default function OperationsView({ data }: Props) {
  const router = useRouter();
  const { attention, todayStats, recentEvents, platformStatus, pendingItems, alertCount, generatedAt } = data;

  const genDate = new Date(generatedAt);
  const hour    = genDate.getHours();
  const greeting =
    hour < 12 ? "Good morning" :
    hour < 17 ? "Good afternoon" :
    "Good evening";

  const dateStr = genDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const timeStr = genDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  function openCommandCenter() {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
  }

  const QUICK_ACTIONS = [
    { id: "new-campaign", label: "New Campaign",   icon: "➕", action: () => router.push("/admin/campaigns/new") },
    { id: "demo",         label: "Demo Center",    icon: "▶",  action: () => router.push("/admin/demo") },
    { id: "analytics",    label: "Analytics",      icon: "╱",  action: () => router.push("/admin/analytics") },
    { id: "audit",        label: "Audit Log",      icon: "☰",  action: () => router.push("/admin/audit") },
    { id: "search",       label: "Command Center", icon: "🔍", action: openCommandCenter },
    { id: "exports",      label: "Export Reports", icon: "📤", action: () => router.push("/admin/exports") },
  ];

  return (
    <div style={{ padding: "2rem", maxWidth: 1200, margin: "0 auto" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: ".75rem", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.02em" }}>
            {greeting}.
          </h2>
          {alertCount > 0 ? (
            <span style={{ fontSize: ".8rem", fontWeight: 600, color: "#dc2626", background: "#fee2e2", padding: ".15rem .6rem", borderRadius: 12 }}>
              {alertCount} alert{alertCount !== 1 ? "s" : ""} need attention
            </span>
          ) : (
            <span style={{ fontSize: ".8rem", fontWeight: 600, color: "#16a34a", background: "#dcfce7", padding: ".15rem .6rem", borderRadius: 12 }}>
              All clear
            </span>
          )}
        </div>
        <div style={{ fontSize: ".75rem", color: "#94a3b8", marginTop: ".3rem" }}>
          {dateStr} · Generated at {timeStr}
        </div>
      </div>

      {/* ── Quick Actions ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginBottom: "2rem" }}>
        {QUICK_ACTIONS.map(qa => (
          <button
            key={qa.id}
            onClick={qa.action}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          ".4rem",
              padding:      ".4rem .85rem",
              background:   "#fff",
              border:       "1px solid #e5e7eb",
              borderRadius: 8,
              cursor:       "pointer",
              fontSize:     ".78rem",
              fontWeight:   500,
              color:        "#374151",
              fontFamily:   "inherit",
            }}
            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#94a3b8"; (e.currentTarget as HTMLButtonElement).style.background = "#f8fafc"; }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e7eb"; (e.currentTarget as HTMLButtonElement).style.background = "#fff"; }}
          >
            <span style={{ fontSize: ".85rem" }}>{qa.icon}</span>
            {qa.label}
          </button>
        ))}
      </div>

      {/* ── Needs Attention ─────────────────────────────────────────────────── */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Needs Attention</div>
        {attention.length === 0 ? (
          <div style={{
            background:   "#f0fdf4",
            border:       "1px solid #86efac",
            borderLeft:   "4px solid #16a34a",
            borderRadius: 10,
            padding:      "1.1rem 1.25rem",
            display:      "flex",
            alignItems:   "center",
            gap:          ".6rem",
          }}>
            <span style={{ fontSize: "1.1rem" }}>✓</span>
            <div>
              <div style={{ fontSize: ".83rem", fontWeight: 600, color: "#166534" }}>Everything looks good</div>
              <div style={{ fontSize: ".73rem", color: "#4ade80", marginTop: ".1rem" }}>No issues detected across all campaigns.</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: ".9rem" }}>
            {attention.map(item => <AttentionCard key={item.id} item={item} />)}
          </div>
        )}
      </section>

      {/* ── Today's Activity ─────────────────────────────────────────────────── */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Today&rsquo;s Activity</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: ".9rem" }}>
          {todayStats.map(stat => <StatCard key={stat.label} stat={stat} />)}
        </div>
      </section>

      {/* ── Bottom: Recent Activity + Right Column ───────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "1.5rem", alignItems: "start" }}>

        {/* Recent Activity */}
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem" }}>
            <div style={sectionLabel}>Recent Activity</div>
            <a href="/admin/audit" style={{ fontSize: ".72rem", color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>
              View all →
            </a>
          </div>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: ".25rem 1rem" }}>
            {recentEvents.length === 0 ? (
              <div style={{ padding: "1.5rem 0", textAlign: "center", fontSize: ".78rem", color: "#94a3b8" }}>
                No recent activity
              </div>
            ) : (
              recentEvents.map(e => <ActivityRow key={e.id} event={e} />)
            )}
          </div>
        </section>

        {/* Right column: Platform Status + Pending Items */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Platform Status */}
          <section>
            <div style={sectionLabel}>Platform Status</div>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: ".25rem 1rem" }}>
              {platformStatus.map(s => <PlatformRow key={s.name} service={s} />)}
            </div>
          </section>

          {/* Pending Items */}
          <section>
            <div style={sectionLabel}>Pending Items</div>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: ".25rem 1rem" }}>
              {pendingItems.map(p => <PendingRow key={p.label} item={p} />)}
              <div style={{ padding: ".6rem 0", fontSize: ".68rem", color: "#94a3b8", fontStyle: "italic" }}>
                Approval workflows coming soon
              </div>
            </div>
          </section>

        </div>
      </div>

    </div>
  );
}
