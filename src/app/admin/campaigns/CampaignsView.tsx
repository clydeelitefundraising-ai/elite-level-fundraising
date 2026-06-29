"use client";

import { useState, useMemo } from "react";
import type { CampaignSummary } from "./page";

type Props = { campaigns: CampaignSummary[] };

function fmt$(cents: number) {
  if (cents >= 100000) return `$${(cents / 100000).toFixed(0)}k`;
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function pct(raised: number, goal: number) {
  if (!goal) return 0;
  return Math.min(100, Math.round((raised / goal) * 100));
}

function StatusBadge({ archived }: { archived: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: ".3rem",
      padding: ".2rem .6rem", borderRadius: 100, fontSize: ".65rem",
      fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase",
      background: archived ? "#f3f4f6" : "#dcfce7",
      color: archived ? "#6b7280" : "#15803d",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: archived ? "#9ca3af" : "#16a34a", display: "inline-block" }} />
      {archived ? "Archived" : "Live"}
    </span>
  );
}

function CampaignCard({ c }: { c: CampaignSummary }) {
  const p = pct(c.raised_cents, c.goal_cents);
  const daysLeft = c.deadline ? Math.ceil((new Date(c.deadline).getTime() - Date.now()) / 86400000) : null;
  const deadlineUrgent = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;

  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #f0f0f2",
      overflow: "hidden", display: "flex", flexDirection: "column",
      transition: "box-shadow .15s, transform .15s",
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(0,0,0,.08)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; (e.currentTarget as HTMLDivElement).style.transform = "none"; }}
    >
      {/* Color accent stripe */}
      <div style={{ height: 4, background: c.primary_color || "#0b1e3d" }} />

      <div style={{ padding: "1.25rem 1.25rem 1rem", flex: 1 }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: ".75rem", gap: ".5rem" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: ".95rem", fontWeight: 700, color: "#1d1d1f", lineHeight: 1.25, marginBottom: ".15rem" }}>
              {c.school_name || c.campaign_slug}
            </div>
            <div style={{ fontSize: ".75rem", color: "#6e6e73", fontWeight: 500 }}>
              {[c.sport_name, c.season].filter(Boolean).join(" · ")}
            </div>
          </div>
          <StatusBadge archived={c.archived} />
        </div>

        {/* Funds raised */}
        {c.goal_cents > 0 && (
          <div style={{ marginBottom: ".875rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".35rem" }}>
              <span style={{ fontSize: ".8rem", fontWeight: 600, color: "#1d1d1f" }}>{fmt$(c.raised_cents)}</span>
              <span style={{ fontSize: ".7rem", color: "#98989d" }}>of {fmt$(c.goal_cents)} goal · {p}%</span>
            </div>
            <div style={{ height: 5, background: "#f0f0f2", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${p}%`, background: p >= 100 ? "#15803d" : c.primary_color || "#0b1e3d", borderRadius: 3, transition: "width .3s" }} />
            </div>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: ".75rem", flexWrap: "wrap" }}>
          <Stat label="Athletes" value={c.athlete_count} />
          <Stat label="Donations" value={c.donor_count} />
          {c.raised_cents > 0 && <Stat label="Raised" value={fmt$(c.raised_cents)} />}
        </div>

        {/* Deadline */}
        {daysLeft !== null && (
          <div style={{ fontSize: ".7rem", fontWeight: 500, color: deadlineUrgent ? "#dc2626" : "#98989d" }}>
            {daysLeft < 0 ? "Deadline passed" : daysLeft === 0 ? "Deadline: today" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: ".75rem 1.25rem", borderTop: "1px solid #f5f5f7", display: "flex", gap: ".5rem", alignItems: "center" }}>
        <span style={{ fontSize: ".65rem", color: "#c7c7cc", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.campaign_slug}
        </span>
        <a href={`/admin/campaigns/${c.campaign_slug}`}
          style={{ fontSize: ".72rem", fontWeight: 600, color: "#0b1e3d", textDecoration: "none", whiteSpace: "nowrap", padding: ".3rem .65rem", background: "#f5f5f7", borderRadius: 6 }}>
          Manage →
        </a>
        <a href={`/campaign/${c.campaign_slug}`} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: ".72rem", fontWeight: 600, color: "#6e6e73", textDecoration: "none", whiteSpace: "nowrap", padding: ".3rem .65rem", background: "#f5f5f7", borderRadius: 6 }}>
          View ↗
        </a>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ".1rem" }}>
      <span style={{ fontSize: ".8rem", fontWeight: 600, color: "#1d1d1f" }}>{value}</span>
      <span style={{ fontSize: ".65rem", color: "#98989d", fontWeight: 500 }}>{label}</span>
    </div>
  );
}

type FilterStatus = "all" | "live" | "archived";

export default function CampaignsView({ campaigns }: Props) {
  const [search,    setSearch]    = useState("");
  const [status,    setStatus]    = useState<FilterStatus>("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return campaigns.filter(c => {
      if (status === "live"     && c.archived)  return false;
      if (status === "archived" && !c.archived) return false;
      if (!q) return true;
      return (
        c.school_name?.toLowerCase().includes(q) ||
        c.sport_name?.toLowerCase().includes(q)  ||
        c.campaign_slug.toLowerCase().includes(q) ||
        c.season?.toLowerCase().includes(q)
      );
    });
  }, [campaigns, search, status]);

  const liveCount     = campaigns.filter(c => !c.archived).length;
  const archivedCount = campaigns.filter(c =>  c.archived).length;

  const filterBtn = (value: FilterStatus, label: string, count: number) => (
    <button
      onClick={() => setStatus(value)}
      style={{
        padding: ".35rem .85rem",
        background: status === value ? "#0b1e3d" : "#fff",
        color:      status === value ? "#fff"    : "#6e6e73",
        border:     status === value ? "none"    : "1px solid #e5e7eb",
        borderRadius: 7,
        cursor: "pointer",
        fontSize: ".75rem",
        fontWeight: 600,
        display: "flex", alignItems: "center", gap: ".4rem",
      }}
    >
      {label}
      <span style={{ fontSize: ".65rem", padding: ".1rem .35rem", borderRadius: 4, background: status === value ? "rgba(255,255,255,.2)" : "#f3f4f6", color: status === value ? "#fff" : "#9ca3af", fontWeight: 700 }}>
        {count}
      </span>
    </button>
  );

  return (
    <div style={{ padding: "1.75rem 2rem" }}>

      {/* Filter + search bar */}
      <div style={{ display: "flex", gap: ".75rem", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: ".4rem" }}>
          {filterBtn("all",      "All",      campaigns.length)}
          {filterBtn("live",     "Live",     liveCount)}
          {filterBtn("archived", "Archived", archivedCount)}
        </div>

        <div style={{ flex: 1, minWidth: 200, maxWidth: 340, position: "relative" }}>
          <span style={{ position: "absolute", left: ".65rem", top: "50%", transform: "translateY(-50%)", fontSize: ".75rem", color: "#c7c7cc", pointerEvents: "none" }}>⌕</span>
          <input
            type="search"
            placeholder="Search campaigns…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", padding: ".42rem .75rem .42rem 1.75rem", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: ".8rem", color: "#1d1d1f", background: "#fff", outline: "none", boxSizing: "border-box" }}
          />
        </div>
      </div>

      {/* Campaign grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#98989d", fontSize: ".875rem" }}>
          No campaigns found.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
          {filtered.map(c => <CampaignCard key={c.campaign_slug} c={c} />)}
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ marginTop: "1.25rem", fontSize: ".72rem", color: "#c7c7cc", textAlign: "right" }}>
          {filtered.length} campaign{filtered.length !== 1 ? "s" : ""}
          {(search || status !== "all") ? ` (filtered from ${campaigns.length})` : ""}
        </div>
      )}
    </div>
  );
}
