"use client";

import { useMemo, useState } from "react";
import type { NotificationsData, NotificationRow, NotificationChannel, NotificationStatus } from "./types";

type Props = { data: NotificationsData };

const STATUS_COLOR: Record<NotificationStatus, { bg: string; text: string }> = {
  queued:     { bg: "#f3f4f6", text: "#374151" },
  processing: { bg: "#eff6ff", text: "#1e40af" },
  sent:       { bg: "#dcfce7", text: "#166534" },
  failed:     { bg: "#fee2e2", text: "#991b1b" },
  cancelled:  { bg: "#f3f4f6", text: "#6b7280" },
};

const CHANNEL_ICON: Record<NotificationChannel, string> = {
  email:    "📧",
  push:     "🔔",
  sms:      "💬",
  internal: "🏠",
};

const sectionLabel: React.CSSProperties = {
  fontSize: ".68rem", fontWeight: 700, color: "#94a3b8",
  letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".75rem",
};

const selectStyle: React.CSSProperties = {
  padding: ".5rem .75rem", border: "1px solid #e5e7eb", borderRadius: 8,
  fontSize: ".85rem", fontFamily: "inherit", background: "#fff",
};

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem 1.1rem" }}>
      <div style={{ fontSize: "1.1rem", marginBottom: ".35rem" }}>{icon}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1d1d1f", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: ".73rem", color: "#6e6e73", marginTop: ".35rem", fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: NotificationStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <span style={{ fontSize: ".68rem", fontWeight: 600, color: c.text, background: c.bg, padding: ".15rem .55rem", borderRadius: 12, whiteSpace: "nowrap", textTransform: "capitalize" }}>
      {status}
    </span>
  );
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

function recipientLabel(n: NotificationRow): string {
  return n.email ?? n.phone ?? (n.recipient_id ? `${n.recipient_type}:${n.recipient_id.slice(0, 8)}` : n.recipient_type);
}

export default function NotificationsView({ data }: Props) {
  const { queue, summary } = data;
  const [channelFilter, setChannelFilter] = useState<NotificationChannel | "all">("all");
  const [statusFilter, setStatusFilter]   = useState<NotificationStatus | "all">("all");
  const [dateFilter, setDateFilter]       = useState(""); // YYYY-MM-DD, matches created_at day

  const filtered = useMemo(() => {
    return queue.filter(n => {
      if (channelFilter !== "all" && n.channel !== channelFilter) return false;
      if (statusFilter !== "all" && n.status !== statusFilter) return false;
      if (dateFilter && n.created_at.slice(0, 10) !== dateFilter) return false;
      return true;
    });
  }, [queue, channelFilter, statusFilter, dateFilter]);

  return (
    <div style={{ padding: "2rem", maxWidth: 1300, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.02em" }}>Notifications</h2>
        <div style={{ fontSize: ".75rem", color: "#94a3b8", marginTop: ".3rem" }}>
          Centralized delivery queue for email, push, SMS, and internal notifications.
        </div>
      </div>

      {/* Summary cards */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: ".9rem" }}>
          <StatCard label="Queued"     value={summary.queued}     icon="🕓" />
          <StatCard label="Processing" value={summary.processing} icon="⚙️" />
          <StatCard label="Sent"       value={summary.sent}       icon="✅" />
          <StatCard label="Failed"     value={summary.failed}     icon="🚨" />
          <StatCard label="Cancelled"  value={summary.cancelled}  icon="🚫" />
        </div>
      </section>

      {/* Filters */}
      <section style={{ marginBottom: "1rem", display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
        <select value={channelFilter} onChange={e => setChannelFilter(e.target.value as NotificationChannel | "all")} style={selectStyle}>
          <option value="all">All channels</option>
          <option value="email">Email</option>
          <option value="push">Push</option>
          <option value="sms">SMS</option>
          <option value="internal">Internal</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as NotificationStatus | "all")} style={selectStyle}>
          <option value="all">All statuses</option>
          <option value="queued">Queued</option>
          <option value="processing">Processing</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={selectStyle} />
        {(channelFilter !== "all" || statusFilter !== "all" || dateFilter) && (
          <button
            onClick={() => { setChannelFilter("all"); setStatusFilter("all"); setDateFilter(""); }}
            style={{ padding: ".5rem .75rem", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: ".78rem", color: "#6e6e73", cursor: "pointer", fontFamily: "inherit" }}
          >
            Clear filters
          </button>
        )}
      </section>

      {/* Queue table */}
      <section>
        <div style={sectionLabel}>Queue ({filtered.length})</div>
        {filtered.length === 0 ? (
          <div style={{ background: "#fff", border: "1px dashed #d1d5db", borderRadius: 10, padding: "2.5rem 1rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: ".5rem" }}>🔔</div>
            <div style={{ fontSize: ".85rem", fontWeight: 600, color: "#374151" }}>No notifications match these filters</div>
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            {filtered.map(n => (
              <div key={n.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: ".85rem 1.1rem", borderBottom: "1px solid #f3f4f6", flexWrap: "wrap" }}>
                <span style={{ fontSize: "1rem", width: 20, textAlign: "center", flexShrink: 0 }}>{CHANNEL_ICON[n.channel]}</span>
                <div style={{ minWidth: 140, fontSize: ".76rem", color: "#374151" }}>{recipientLabel(n)}</div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: ".82rem", fontWeight: 600, color: "#1d1d1f" }}>{n.title}</div>
                  <div style={{ fontSize: ".72rem", color: "#94a3b8", marginTop: ".15rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</div>
                </div>
                <StatusBadge status={n.status} />
                <div style={{ fontSize: ".72rem", color: "#94a3b8", minWidth: 60, textAlign: "center" }}>{n.attempts}</div>
                <div style={{ fontSize: ".72rem", color: "#94a3b8", minWidth: 90 }}>{relativeTime(n.scheduled_for)}</div>
                <div style={{ fontSize: ".72rem", color: "#94a3b8", minWidth: 90 }}>{n.sent_at ? relativeTime(n.sent_at) : "—"}</div>
                {n.last_error && (
                  <div style={{ fontSize: ".72rem", color: "#dc2626", flex: 1, minWidth: 150 }}>{n.last_error}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
