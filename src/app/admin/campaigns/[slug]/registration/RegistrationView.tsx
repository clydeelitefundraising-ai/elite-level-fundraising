"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { AthleteRegistration, RegistrationSummary } from "@/app/api/admin/campaigns/[slug]/registration/route";

type Props = {
  slug:          string;
  campaignLabel: string;
  athletes:      AthleteRegistration[];
  summary:       RegistrationSummary;
};

// ── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  label: { fontSize: ".68rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase" as const, letterSpacing: ".05em" },
  input: { padding: ".4rem .65rem", border: "1px solid #d1d5db", borderRadius: 7, fontSize: ".8rem", color: "#1d1d1f", background: "#fff", outline: "none" },
};

// ── Status badge ──────────────────────────────────────────────────────────────

type StatusType = "complete" | "in_progress" | "not_started" | "missing";

const STATUS_STYLES: Record<StatusType, { bg: string; text: string; label: string }> = {
  complete:     { bg: "#dcfce7", text: "#15803d", label: "Complete" },
  in_progress:  { bg: "#fef9c3", text: "#854d0e", label: "In Progress" },
  not_started:  { bg: "#f3f4f6", text: "#6b7280", label: "Not Started" },
  missing:      { bg: "#fee2e2", text: "#dc2626", label: "Missing" },
};

function StatusBadge({ status }: { status: StatusType }) {
  const s = STATUS_STYLES[status];
  return (
    <span style={{ display: "inline-block", padding: ".15rem .55rem", borderRadius: 6, fontSize: ".65rem", fontWeight: 700, letterSpacing: ".03em", background: s.bg, color: s.text, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function CheckDot({ ok, na }: { ok: boolean; na?: boolean }) {
  if (na) return <span style={{ fontSize: ".72rem", color: "#d1d5db" }}>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: ok ? "#dcfce7" : "#fee2e2", flexShrink: 0 }}>
      <span style={{ fontSize: ".65rem", color: ok ? "#15803d" : "#dc2626", fontWeight: 700 }}>{ok ? "✓" : "✗"}</span>
    </span>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #f0f0f2", borderRadius: 12, padding: ".85rem 1.1rem", minWidth: 110 }}>
      <div style={{ fontSize: "1.4rem", fontWeight: 800, color: color ?? "#1d1d1f", letterSpacing: "-.02em", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: ".65rem", fontWeight: 600, color: "#98989d", textTransform: "uppercase", letterSpacing: ".05em", marginTop: ".3rem" }}>{label}</div>
      {sub && <div style={{ fontSize: ".65rem", color: "#c7c7cc", marginTop: ".15rem" }}>{sub}</div>}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function MiniBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
      <div style={{ flex: 1, height: 5, background: "#f0f0f2", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: ".65rem", color: "#98989d", fontWeight: 500, whiteSpace: "nowrap", width: 28, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RegistrationView({ slug, campaignLabel, athletes, summary }: Props) {
  const router = useRouter();
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return athletes.filter(a => {
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q) || (a.event ?? "").toLowerCase().includes(q);
    });
  }, [athletes, search, filterStatus]);

  const fmt$ = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const n    = summary.total_athletes;

  return (
    <div style={{ padding: "1.5rem 2rem", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: "1.25rem", fontSize: ".75rem", color: "#98989d" }}>
        <button onClick={() => router.push("/admin/campaigns")} style={{ background: "none", border: "none", cursor: "pointer", color: "#0b1e3d", fontWeight: 600, fontSize: ".75rem", padding: 0 }}>Campaigns</button>
        <span>/</span>
        <button onClick={() => router.push(`/admin/campaigns/${slug}`)} style={{ background: "none", border: "none", cursor: "pointer", color: "#0b1e3d", fontWeight: 600, fontSize: ".75rem", padding: 0 }}>{campaignLabel || slug}</button>
        <span>/</span>
        <span style={{ color: "#1d1d1f", fontWeight: 500 }}>Registration</span>
      </div>

      {/* Page title */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#1d1d1f", letterSpacing: "-.02em" }}>Registration Dashboard</h1>
        <p style={{ margin: ".3rem 0 0", fontSize: ".78rem", color: "#98989d" }}>{campaignLabel}</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: ".75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <SummaryCard label="Total athletes"    value={summary.total_athletes} />
        <SummaryCard label="Athlete accounts"  value={summary.athlete_accounts_created} sub={n > 0 ? `${Math.round(summary.athlete_accounts_created/n*100)}%` : undefined} color="#1d4ed8" />
        <SummaryCard label="Parents linked"    value={summary.parents_linked}           sub={n > 0 ? `${Math.round(summary.parents_linked/n*100)}%` : undefined} color="#7e22ce" />
        <SummaryCard label="Photos uploaded"   value={summary.photos_uploaded}          sub={n > 0 ? `${Math.round(summary.photos_uploaded/n*100)}%` : undefined} color="#0369a1" />
        <SummaryCard label="Zero contacts"     value={summary.zero_contacts}            color={summary.zero_contacts > 0 ? "#dc2626" : "#15803d"} />
        <SummaryCard label="Goal met"          value={summary.contact_goal_met}         sub={n > 0 ? `${Math.round(summary.contact_goal_met/n*100)}%` : undefined} color="#15803d" />
        <SummaryCard label="Has donations"     value={summary.has_donations}            sub={n > 0 ? `${Math.round(summary.has_donations/n*100)}%` : undefined} color="#c2410c" />
      </div>

      {/* Status breakdown panel */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f2", borderRadius: 12, padding: "1.1rem 1.25rem", marginBottom: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
        {[
          { label: "Complete",    value: summary.complete,    color: "#16a34a" },
          { label: "In Progress", value: summary.in_progress, color: "#d97706" },
          { label: "Not Started", value: summary.not_started, color: "#9ca3af" },
        ].map(s => (
          <div key={s.label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ".35rem" }}>
              <span style={{ ...T.label }}>{s.label}</span>
              <span style={{ fontSize: ".78rem", fontWeight: 700, color: "#1d1d1f" }}>{s.value}<span style={{ color: "#98989d", fontWeight: 400 }}>/{n}</span></span>
            </div>
            <MiniBar value={s.value} total={n} color={s.color} />
          </div>
        ))}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ".35rem" }}>
            <span style={{ ...T.label }}>Adoption rate</span>
            <span style={{ fontSize: ".78rem", fontWeight: 700, color: "#1d1d1f" }}>{n > 0 ? Math.round(summary.athlete_accounts_created/n*100) : 0}%</span>
          </div>
          <MiniBar value={summary.athlete_accounts_created} total={n} color="#1d4ed8" />
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f2", borderRadius: 12, padding: ".85rem 1.1rem", marginBottom: "1rem", display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="search"
          placeholder="Search athlete name or event…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...T.input, width: 240 }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={T.input}>
          <option value="all">All statuses</option>
          <option value="complete">Complete</option>
          <option value="in_progress">In Progress</option>
          <option value="not_started">Not Started</option>
        </select>
        <span style={{ ...T.label, marginLeft: "auto" }}>{filtered.length} of {n} athletes</span>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f2", borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".78rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #f0f0f2" }}>
              {[
                { h: "Athlete",           w: "auto" },
                { h: "Status",            w: 110 },
                { h: "Acct",              w: 48 },
                { h: "Parent",            w: 56 },
                { h: "Photo",             w: 52 },
                { h: "Contacts",          w: 84 },
                { h: "Goal",              w: 52 },
                { h: "Goal Met",          w: 72 },
                { h: "Donations",         w: 88 },
              ].map(({ h: label, w }) => (
                <th key={label} style={{ padding: ".6rem .85rem", textAlign: "left", ...T.label, background: "#fafafa", whiteSpace: "nowrap", width: typeof w === "number" ? w : undefined }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: "2.5rem", textAlign: "center", color: "#9ca3af", fontSize: ".8rem" }}>
                  {athletes.length === 0 ? "No athletes on this roster yet." : "No athletes match your filters."}
                </td>
              </tr>
            )}
            {filtered.map((a, i) => (
              <tr key={a.athlete_id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #f5f5f7" : "none", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: ".65rem .85rem" }}>
                  <div style={{ fontWeight: 600, color: "#1d1d1f" }}>{a.name}</div>
                  <div style={{ fontSize: ".68rem", color: "#98989d", marginTop: ".1rem" }}>
                    {[a.class_year ?? a.event, a.jersey_number ? `#${a.jersey_number}` : null, a.grad_year ? `'${String(a.grad_year).slice(-2)}` : null].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td style={{ padding: ".65rem .85rem" }}>
                  <StatusBadge status={a.status} />
                </td>
                <td style={{ padding: ".65rem .85rem", textAlign: "center" }}>
                  <CheckDot ok={a.athlete_account_created} />
                </td>
                <td style={{ padding: ".65rem .85rem", textAlign: "center" }}>
                  <CheckDot ok={a.parent_linked} />
                </td>
                <td style={{ padding: ".65rem .85rem", textAlign: "center" }}>
                  <CheckDot ok={a.profile_photo_uploaded} />
                </td>
                <td style={{ padding: ".65rem .85rem", textAlign: "center" }}>
                  <span style={{ fontWeight: 600, color: a.contacts_entered === 0 ? "#dc2626" : "#15803d" }}>{a.contacts_entered}</span>
                </td>
                <td style={{ padding: ".65rem .85rem", textAlign: "center", color: "#6e6e73" }}>
                  {a.contact_goal}
                </td>
                <td style={{ padding: ".65rem .85rem", textAlign: "center" }}>
                  <CheckDot ok={a.contact_goal_met} />
                </td>
                <td style={{ padding: ".65rem .85rem", textAlign: "right", fontWeight: 600, color: a.donations_cents > 0 ? "#15803d" : "#9ca3af" }}>
                  {a.donations_cents > 0 ? fmt$(a.donations_cents) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: ".75rem", fontSize: ".7rem", color: "#c7c7cc" }}>
        Donations only reflect entries where the donor linked to a specific athlete. Unlinked donations are not included.
      </div>
    </div>
  );
}
