"use client";

import { useMemo, useState } from "react";
import { HEALTH_LABELS } from "./types";
import type { TeamHealth, HealthData, HealthLabel } from "./types";

type Props = { data: HealthData };

type SortKey = "score" | "deadline" | "raised" | "activity";

const LABEL_COLOR: Record<HealthLabel, { bg: string; text: string; border: string }> = {
  healthy: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
  watch:   { bg: "#fffbeb", text: "#92400e", border: "#fcd34d" },
  at_risk: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
};

const sectionLabel: React.CSSProperties = {
  fontSize: ".68rem", fontWeight: 700, color: "#94a3b8",
  letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".75rem",
};

const inputStyle: React.CSSProperties = {
  padding: ".5rem .75rem", border: "1px solid #e5e7eb", borderRadius: 8,
  fontSize: ".85rem", color: "#1d1d1f", background: "#fff", outline: "none",
  fontFamily: "inherit",
};

function money(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem 1.1rem" }}>
      <div style={{ fontSize: "1.1rem", marginBottom: ".35rem" }}>{icon}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1d1d1f", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: ".73rem", color: "#6e6e73", marginTop: ".35rem", fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function ScoreRing({ score, label }: { score: number; label: HealthLabel }) {
  const c = LABEL_COLOR[label];
  return (
    <div style={{
      width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
      background: c.bg, border: `2px solid ${c.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ fontSize: ".82rem", fontWeight: 700, color: c.text }}>{score}</span>
    </div>
  );
}

function LabelBadge({ label }: { label: HealthLabel }) {
  const c = LABEL_COLOR[label];
  return (
    <span style={{ fontSize: ".68rem", fontWeight: 600, color: c.text, background: c.bg, padding: ".15rem .55rem", borderRadius: 12, whiteSpace: "nowrap" }}>
      {HEALTH_LABELS[label]}
    </span>
  );
}

function TeamCard({ team }: { team: TeamHealth }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1.1rem", display: "flex", gap: "1rem" }}>
      <ScoreRing score={team.score} label={team.label} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: ".75rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: ".9rem", fontWeight: 700, color: "#1d1d1f" }}>{team.schoolName}</div>
            <div style={{ fontSize: ".74rem", color: "#94a3b8", marginTop: ".1rem" }}>
              {team.sportName}{team.season ? ` · ${team.season}` : ""}
            </div>
          </div>
          <LabelBadge label={team.label} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: ".5rem", marginTop: ".75rem", fontSize: ".76rem", color: "#374151" }}>
          <div><span style={{ color: "#94a3b8" }}>Raised: </span>{money(team.raisedCents)} / {money(team.goalCents)} ({team.pctToGoal}%)</div>
          <div><span style={{ color: "#94a3b8" }}>Days left: </span>{team.daysRemaining != null ? team.daysRemaining : "—"}</div>
          <div><span style={{ color: "#94a3b8" }}>Last donation: </span>{fmtDate(team.lastDonationAt)}</div>
          <div><span style={{ color: "#94a3b8" }}>Athletes: </span>{team.athleteCount}</div>
        </div>

        {team.reasons.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".35rem", marginTop: ".65rem" }}>
            {team.reasons.map(r => (
              <span key={r} style={{
                fontSize: ".66rem", fontWeight: 500, color: "#475569", background: "#f1f5f9",
                padding: ".15rem .5rem", borderRadius: 6,
              }}>
                {r}
              </span>
            ))}
          </div>
        )}

        <div style={{ marginTop: ".75rem" }}>
          <a href={`/admin/campaigns/${team.slug}`} style={{ fontSize: ".74rem", fontWeight: 600, color: "#2563eb", textDecoration: "none" }}>
            View Campaign →
          </a>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ background: "#fff", border: "1px dashed #d1d5db", borderRadius: 10, padding: "2.5rem 1rem", textAlign: "center" }}>
      <div style={{ fontSize: "1.5rem", marginBottom: ".5rem" }}>📊</div>
      <div style={{ fontSize: ".85rem", fontWeight: 600, color: "#374151" }}>No campaigns to evaluate yet</div>
      <div style={{ fontSize: ".75rem", color: "#94a3b8", marginTop: ".35rem" }}>
        Team health scores will appear here once campaigns are created.
      </div>
    </div>
  );
}

export default function TeamHealthView({ data }: Props) {
  const { teams, summary } = data;

  const [query, setQuery]         = useState("");
  const [labelFilter, setLabelFilter] = useState<HealthLabel | "all">("all");
  const [sortKey, setSortKey]     = useState<SortKey>("score");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = teams.filter(t => {
      if (labelFilter !== "all" && t.label !== labelFilter) return false;
      if (!q) return true;
      return [t.schoolName, t.sportName, t.slug].some(v => v?.toLowerCase().includes(q));
    });

    rows = [...rows].sort((a, b) => {
      switch (sortKey) {
        case "deadline":
          return (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity);
        case "raised":
          return b.raisedCents - a.raisedCents;
        case "activity":
          return (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "");
        case "score":
        default:
          return a.score - b.score;
      }
    });
    return rows;
  }, [teams, labelFilter, query, sortKey]);

  return (
    <div style={{ padding: "2rem", maxWidth: 1200, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.02em" }}>Team Health</h2>
        <div style={{ fontSize: ".75rem", color: "#94a3b8", marginTop: ".3rem" }}>
          Health scores for every active team, based on donation pace, engagement, and setup.
        </div>
      </div>

      {/* Summary cards */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: ".9rem" }}>
          <StatCard label="Total Teams"          value={summary.totalTeams}    icon="🏕" />
          <StatCard label="Healthy"              value={summary.healthy}       icon="✅" />
          <StatCard label="Watch"                value={summary.watch}         icon="👀" />
          <StatCard label="At Risk"              value={summary.atRisk}        icon="⚠️" />
          <StatCard label="Avg Health Score"     value={summary.averageScore}  icon="📈" />
          <StatCard label="Behind Pace"          value={summary.behindPaceCount} icon="📉" />
        </div>
      </section>

      {teams.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Filters */}
          <section style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Search team, school, or sport…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{ ...inputStyle, width: 280 }}
              />
              <select value={labelFilter} onChange={e => setLabelFilter(e.target.value as HealthLabel | "all")} style={inputStyle}>
                <option value="all">All statuses</option>
                <option value="healthy">Healthy</option>
                <option value="watch">Watch</option>
                <option value="at_risk">At Risk</option>
              </select>
              <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} style={inputStyle}>
                <option value="score">Sort: Score (lowest first)</option>
                <option value="deadline">Sort: Deadline</option>
                <option value="raised">Sort: Amount Raised</option>
                <option value="activity">Sort: Recent Activity</option>
              </select>
            </div>
          </section>

          {/* Team list */}
          <section>
            <div style={sectionLabel}>Teams ({filtered.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: ".9rem" }}>
              {filtered.map(t => <TeamCard key={t.slug} team={t} />)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
