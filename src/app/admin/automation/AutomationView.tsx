"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AutomationData, AutomationEvent, AutomationSeverity, AutomationStatus } from "./types";

type Props = { data: AutomationData };

const SEV_COLOR: Record<AutomationSeverity, { bg: string; text: string; border: string }> = {
  critical: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
  warning:  { bg: "#fffbeb", text: "#92400e", border: "#fcd34d" },
  info:     { bg: "#eff6ff", text: "#1e40af", border: "#93c5fd" },
};

const STATUS_COLOR: Record<AutomationStatus, { bg: string; text: string }> = {
  open:         { bg: "#f3f4f6", text: "#374151" },
  acknowledged: { bg: "#eff6ff", text: "#1e40af" },
  resolved:     { bg: "#dcfce7", text: "#166534" },
};

const sectionLabel: React.CSSProperties = {
  fontSize: ".68rem", fontWeight: 700, color: "#94a3b8",
  letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".75rem",
};

const primaryBtn: React.CSSProperties = {
  padding: ".55rem 1.1rem", background: "#0b1e3d", color: "#fff", border: "none",
  borderRadius: 8, fontSize: ".82rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

const smallBtn: React.CSSProperties = {
  padding: ".3rem .65rem", background: "#fff", color: "#374151", border: "1px solid #e5e7eb",
  borderRadius: 6, fontSize: ".7rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
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

function SeverityBadge({ severity }: { severity: AutomationSeverity }) {
  const c = SEV_COLOR[severity];
  return (
    <span style={{ fontSize: ".68rem", fontWeight: 600, color: c.text, background: c.bg, padding: ".15rem .55rem", borderRadius: 12, whiteSpace: "nowrap", textTransform: "capitalize" }}>
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: AutomationStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <span style={{ fontSize: ".68rem", fontWeight: 600, color: c.text, background: c.bg, padding: ".15rem .55rem", borderRadius: 12, whiteSpace: "nowrap", textTransform: "capitalize" }}>
      {status}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AutomationView({ data }: Props) {
  const router = useRouter();
  const [events, setEvents] = useState<AutomationEvent[]>(data.events);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState("");
  const [statusFilter, setStatusFilter] = useState<AutomationStatus | "all">("open");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { summary } = data;

  async function runRules() {
    setRunning(true);
    setRunMsg("");
    try {
      const res = await fetch("/api/admin/automation/run", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to run rules.");
      setRunMsg(`${json.rulesEvaluated} rules evaluated · ${json.eventsCreated} created · ${json.eventsResolved} resolved (${json.executionTimeMs}ms)`);
      router.refresh();
    } catch (e) {
      setRunMsg(e instanceof Error ? e.message : "Failed to run rules.");
    } finally {
      setRunning(false);
    }
  }

  async function updateStatus(id: string, status: AutomationStatus) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/automation/events/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        setEvents(prev => prev.map(e => (e.id === id ? { ...e, ...updated } : e)));
        router.refresh();
      }
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = statusFilter === "all" ? events : events.filter(e => e.status === statusFilter);

  return (
    <div style={{ padding: "2rem", maxWidth: 1300, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: ".75rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.02em" }}>Automation</h2>
          <div style={{ fontSize: ".75rem", color: "#94a3b8", marginTop: ".3rem" }}>
            Rules automatically detect operational issues and record them here.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
          {runMsg && <span style={{ fontSize: ".75rem", color: "#6e6e73" }}>{runMsg}</span>}
          <button onClick={runRules} disabled={running} style={primaryBtn}>
            {running ? "Running…" : "Run Rules Now"}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: ".9rem" }}>
          <StatCard label="Open Events"    value={summary.open}          icon="⚡" />
          <StatCard label="Critical"       value={summary.critical}      icon="🔴" />
          <StatCard label="Warning"        value={summary.warning}       icon="🟡" />
          <StatCard label="Info"           value={summary.info}          icon="🔵" />
          <StatCard label="Resolved Today" value={summary.resolvedToday} icon="✅" />
        </div>
      </section>

      {/* Filter */}
      <section style={{ marginBottom: "1rem" }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as AutomationStatus | "all")}
          style={{ padding: ".5rem .75rem", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: ".85rem", fontFamily: "inherit" }}>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="all">All statuses</option>
        </select>
      </section>

      {/* Table */}
      <section>
        <div style={sectionLabel}>Events ({filtered.length})</div>
        {filtered.length === 0 ? (
          <div style={{ background: "#fff", border: "1px dashed #d1d5db", borderRadius: 10, padding: "2.5rem 1rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: ".5rem" }}>⚡</div>
            <div style={{ fontSize: ".85rem", fontWeight: 600, color: "#374151" }}>No automation events</div>
            <div style={{ fontSize: ".75rem", color: "#94a3b8", marginTop: ".35rem" }}>
              Run the rules to evaluate current platform state.
            </div>
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            {filtered.map(e => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: ".85rem 1.1rem", borderBottom: "1px solid #f3f4f6", flexWrap: "wrap" }}>
                <SeverityBadge severity={e.severity} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: ".82rem", fontWeight: 600, color: "#1d1d1f" }}>{e.title}</div>
                  {e.description && (
                    <div style={{ fontSize: ".72rem", color: "#94a3b8", marginTop: ".15rem" }}>{e.description}</div>
                  )}
                </div>
                <div style={{ fontSize: ".76rem", color: "#374151", minWidth: 120 }}>{e.campaignName ?? "—"}</div>
                <div style={{ fontSize: ".76rem", color: "#374151", minWidth: 100 }}>{e.coachName ?? "—"}</div>
                <div style={{ fontSize: ".72rem", color: "#94a3b8", minWidth: 80 }}>{relativeTime(e.created_at)}</div>
                <StatusBadge status={e.status} />
                <div style={{ display: "flex", gap: ".4rem" }}>
                  {e.status !== "acknowledged" && e.status !== "resolved" && (
                    <button onClick={() => updateStatus(e.id, "acknowledged")} disabled={updatingId === e.id} style={smallBtn}>
                      Acknowledge
                    </button>
                  )}
                  {e.status !== "resolved" && (
                    <button onClick={() => updateStatus(e.id, "resolved")} disabled={updatingId === e.id} style={smallBtn}>
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
