"use client";

import { useState, useMemo } from "react";
import type { AccountRow } from "@/app/api/admin/accounts/route";

type Props = {
  accounts:      AccountRow[];
  campaignSlugs: string[];
  campaignLabel: Record<string, string>;
};

// ── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  label: { fontSize: ".7rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase" as const, letterSpacing: ".05em" },
  input: { padding: ".4rem .65rem", border: "1px solid #d1d5db", borderRadius: 7, fontSize: ".8rem", color: "#1d1d1f", background: "#fff", outline: "none" },
};

const ROLE_LABELS: Record<string, string> = {
  head_coach:      "Head Coach",
  assistant_coach: "Asst. Coach",
  booster:         "Booster",
  athlete:         "Athlete",
  parent:          "Parent",
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  head_coach:      { bg: "#eff6ff", text: "#1d4ed8" },
  assistant_coach: { bg: "#f0f9ff", text: "#0369a1" },
  booster:         { bg: "#fdf4ff", text: "#7e22ce" },
  athlete:         { bg: "#f0fdf4", text: "#15803d" },
  parent:          { bg: "#fff7ed", text: "#c2410c" },
};

function RoleBadge({ role }: { role: string }) {
  const style = ROLE_COLORS[role] ?? { bg: "#f3f4f6", text: "#374151" };
  return (
    <span style={{ display: "inline-block", padding: ".15rem .55rem", borderRadius: 6, fontSize: ".68rem", fontWeight: 700, letterSpacing: ".03em", background: style.bg, color: style.text }}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function AccountBadge({ created }: { created: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: ".3rem", fontSize: ".7rem", fontWeight: 600, color: created ? "#15803d" : "#9ca3af" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: created ? "#16a34a" : "#d1d5db", display: "inline-block" }} />
      {created ? "Active" : "Pending"}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ALL_ROLES = ["head_coach", "assistant_coach", "booster", "athlete", "parent"];

export default function AccountsView({ accounts, campaignSlugs, campaignLabel }: Props) {
  const [search,     setSearch]     = useState("");
  const [filterCampaign, setFilterCampaign] = useState("all");
  const [filterRole,     setFilterRole]     = useState("all");
  const [filterStatus,   setFilterStatus]   = useState("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return accounts.filter(a => {
      if (filterCampaign !== "all" && a.campaign_slug !== filterCampaign) return false;
      if (filterRole     !== "all" && a.role !== filterRole)              return false;
      if (filterStatus === "active"  && !a.account_created) return false;
      if (filterStatus === "pending" && a.account_created)  return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        (a.email ?? "").toLowerCase().includes(q) ||
        (a.phone ?? "").includes(q)
      );
    });
  }, [accounts, search, filterCampaign, filterRole, filterStatus]);

  // Summary counts
  const total   = accounts.length;
  const active  = accounts.filter(a => a.account_created).length;
  const coaches = accounts.filter(a => ["head_coach","assistant_coach","booster"].includes(a.role)).length;
  const athletes = accounts.filter(a => a.role === "athlete").length;
  const parents  = accounts.filter(a => a.role === "parent").length;

  return (
    <div style={{ padding: "1.5rem 2rem", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Summary strip */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {[
          { label: "Total records",    value: total },
          { label: "Active accounts",  value: active },
          { label: "Pending accounts", value: total - active },
          { label: "Coaches/Boosters", value: coaches },
          { label: "Athletes",         value: athletes },
          { label: "Parents",          value: parents },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #f0f0f2", borderRadius: 12, padding: ".85rem 1.25rem", minWidth: 120 }}>
            <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#1d1d1f", letterSpacing: "-.02em", lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: ".68rem", fontWeight: 600, color: "#98989d", textTransform: "uppercase", letterSpacing: ".05em", marginTop: ".3rem" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f2", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1rem", display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="search"
          placeholder="Search name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...T.input, width: 220 }}
        />

        <select value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)} style={T.input}>
          <option value="all">All campaigns</option>
          {campaignSlugs.map(s => (
            <option key={s} value={s}>{campaignLabel[s] ?? s}</option>
          ))}
        </select>

        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={T.input}>
          <option value="all">All roles</option>
          {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={T.input}>
          <option value="all">All statuses</option>
          <option value="active">Active account</option>
          <option value="pending">Pending (no account)</option>
        </select>

        <span style={{ ...T.label, marginLeft: "auto" }}>{filtered.length} of {total}</span>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f2", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #f0f0f2" }}>
              {["Name", "Role", "Campaign", "Contact", "Linked Athlete", "Account", "Joined"].map(h => (
                <th key={h} style={{ padding: ".65rem 1rem", textAlign: "left", ...T.label, fontWeight: 700, background: "#fafafa", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "2.5rem", textAlign: "center", color: "#9ca3af", fontSize: ".8rem" }}>
                  No accounts match your filters.
                </td>
              </tr>
            )}
            {filtered.map((a, i) => (
              <tr key={a.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #f5f5f7" : "none", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: ".65rem 1rem" }}>
                  <div style={{ fontWeight: 600, color: "#1d1d1f" }}>{a.name || <span style={{ color: "#c7c7cc" }}>—</span>}</div>
                  {a.source === "member" && (
                    <div style={{ fontSize: ".68rem", color: "#98989d", fontFamily: "monospace", marginTop: ".1rem" }}>{a.id.slice(0, 8)}…</div>
                  )}
                </td>
                <td style={{ padding: ".65rem 1rem" }}>
                  <RoleBadge role={a.role} />
                </td>
                <td style={{ padding: ".65rem 1rem" }}>
                  <div style={{ color: "#1d1d1f" }}>{a.campaign_label}</div>
                  <div style={{ fontSize: ".68rem", color: "#c7c7cc", fontFamily: "monospace" }}>{a.campaign_slug}</div>
                </td>
                <td style={{ padding: ".65rem 1rem" }}>
                  {a.email && <div style={{ color: "#1d1d1f" }}>{a.email}</div>}
                  {a.phone && <div style={{ color: "#6e6e73", fontSize: ".75rem" }}>{a.phone}</div>}
                  {!a.email && !a.phone && <span style={{ color: "#c7c7cc" }}>—</span>}
                </td>
                <td style={{ padding: ".65rem 1rem" }}>
                  {a.athlete_id
                    ? <span style={{ fontSize: ".68rem", fontFamily: "monospace", color: "#6e6e73", background: "#f5f5f7", padding: ".1rem .4rem", borderRadius: 4 }}>{a.athlete_id.slice(0, 8)}…</span>
                    : <span style={{ color: "#c7c7cc" }}>—</span>
                  }
                </td>
                <td style={{ padding: ".65rem 1rem" }}>
                  <AccountBadge created={a.account_created} />
                </td>
                <td style={{ padding: ".65rem 1rem", color: "#6e6e73", whiteSpace: "nowrap" }}>
                  {fmtDate(a.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: ".75rem", fontSize: ".7rem", color: "#c7c7cc" }}>
        Last login is not tracked in the current schema.
      </div>
    </div>
  );
}
