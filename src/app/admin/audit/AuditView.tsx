"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type AuditLog = {
  id:               string;
  created_at:       string;
  admin_identifier: string | null;
  action:           string;
  entity_type:      string | null;
  entity_id:        string | null;
  campaign_slug:    string | null;
  summary:          string | null;
  previous_value:   Record<string, unknown> | null;
  new_value:        Record<string, unknown> | null;
  ip_address:       string | null;
  user_agent:       string | null;
};

type CampaignOption = { campaign_slug: string; school_name: string };

type Props = { campaigns: CampaignOption[] };

const ACTION_OPTIONS = [
  { value: "",                    label: "All actions" },
  { value: "campaign.created",    label: "Campaign created" },
  { value: "campaign.duplicated", label: "Campaign duplicated" },
  { value: "campaign.archived",   label: "Campaign archived" },
  { value: "campaign.restored",   label: "Campaign restored" },
  { value: "campaign.updated",    label: "Campaign updated" },
  { value: "athlete.added",       label: "Athlete added" },
  { value: "athlete.updated",     label: "Athlete updated" },
  { value: "athlete.deleted",     label: "Athlete deleted" },
  { value: "coach.added",         label: "Coach added" },
  { value: "coach.removed",       label: "Coach removed" },
  { value: "sponsor.added",       label: "Sponsor added" },
  { value: "sponsor.updated",     label: "Sponsor updated" },
  { value: "sponsor.deleted",     label: "Sponsor deleted" },
  { value: "fund_use.added",      label: "Fund use added" },
  { value: "fund_use.updated",    label: "Fund use updated" },
  { value: "fund_use.deleted",    label: "Fund use deleted" },
  { value: "export.donations",    label: "Donations exported" },
  { value: "export.contacts",     label: "Contacts exported" },
  { value: "export.registration", label: "Registration exported" },
  { value: "export.campaigns",    label: "Campaigns exported" },
];

const BADGE: Record<string, { bg: string; color: string }> = {
  campaign: { bg: "#dbeafe", color: "#1e40af" },
  athlete:  { bg: "#ede9fe", color: "#6d28d9" },
  coach:    { bg: "#fef3c7", color: "#92400e" },
  sponsor:  { bg: "#dcfce7", color: "#166534" },
  fund_use: { bg: "#cffafe", color: "#155e75" },
  export:   { bg: "#f3f4f6", color: "#374151" },
};

function actionBadge(action: string) {
  const prefix = action.split(".")[0];
  const style  = BADGE[prefix] ?? { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{
      display: "inline-block",
      padding: ".15rem .55rem",
      borderRadius: 5,
      fontSize: ".68rem",
      fontWeight: 700,
      letterSpacing: ".02em",
      background: style.bg,
      color: style.color,
      whiteSpace: "nowrap",
    }}>
      {action}
    </span>
  );
}

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)         return "just now";
  if (ms < 3_600_000)      return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000)     return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 604_800_000)    return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fullTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function AuditView({ campaigns }: Props) {
  const [rows,     setRows]     = useState<AuditLog[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [campaign,    setCampaign]    = useState("");
  const [action,      setAction]      = useState("");
  const [from,        setFrom]        = useState("");
  const [to,          setTo]          = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const perPage = 50;

  const load = useCallback(async (p: number, search: string) => {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams();
      sp.set("page", String(p));
      if (search.trim())  sp.set("search",   search.trim());
      if (campaign)        sp.set("campaign", campaign);
      if (action)          sp.set("action",   action);
      if (from)            sp.set("from",     from);
      if (to)              sp.set("to",       to);
      const res = await fetch(`/api/admin/audit?${sp.toString()}`);
      if (!res.ok) { setError("Failed to load audit log."); return; }
      const data = await res.json() as { rows: AuditLog[]; total: number };
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setPage(p);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [campaign, action, from, to]);

  // Reload when filters change (but not search — search needs explicit submit)
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; void load(1, appliedSearch); return; }
    void load(1, appliedSearch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign, action, from, to]);

  function submitSearch() {
    setAppliedSearch(searchInput);
    void load(1, searchInput);
  }

  function clearFilters() {
    setSearchInput("");
    setAppliedSearch("");
    setCampaign("");
    setAction("");
    setFrom("");
    setTo("");
  }

  // Keyboard shortcut for details drawer
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  const hasFilters = !!(campaign || action || from || to || appliedSearch);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start      = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end        = Math.min(page * perPage, total);

  const inputStyle: React.CSSProperties = {
    padding: ".4rem .65rem",
    border: "1px solid #e5e7eb",
    borderRadius: 7,
    fontSize: ".78rem",
    color: "#1d1d1f",
    background: "#fff",
    outline: "none",
  };

  return (
    <div style={{ padding: "1.5rem 2rem", maxWidth: 1200 }}>

      {/* Filter bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: ".6rem", alignItems: "center", marginBottom: "1.25rem", background: "#fff", padding: ".875rem 1rem", borderRadius: 10, border: "1px solid #f0f0f2" }}>
        {/* Search */}
        <form onSubmit={e => { e.preventDefault(); submitSearch(); }} style={{ display: "flex", gap: ".4rem", flex: "1 1 220px" }}>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search summary, action, campaign…"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="submit" style={{ padding: ".4rem .8rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 7, fontSize: ".78rem", fontWeight: 600, cursor: "pointer" }}>
            Search
          </button>
        </form>

        {/* Campaign */}
        <select value={campaign} onChange={e => setCampaign(e.target.value)} style={{ ...inputStyle, flex: "1 1 160px" }}>
          <option value="">All campaigns</option>
          {campaigns.map(c => (
            <option key={c.campaign_slug} value={c.campaign_slug}>
              {c.school_name || c.campaign_slug}
            </option>
          ))}
        </select>

        {/* Action */}
        <select value={action} onChange={e => setAction(e.target.value)} style={{ ...inputStyle, flex: "1 1 160px" }}>
          {ACTION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Date range */}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inputStyle, flex: "0 0 140px" }} />
        <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={{ ...inputStyle, flex: "0 0 140px" }} />

        {hasFilters && (
          <button onClick={clearFilters} style={{ padding: ".4rem .7rem", background: "none", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: ".75rem", color: "#6e6e73", cursor: "pointer" }}>
            Clear
          </button>
        )}
      </div>

      {/* Status bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".75rem" }}>
        <div style={{ fontSize: ".75rem", color: "#6e6e73", fontWeight: 500 }}>
          {loading ? "Loading…" : error ? error : total === 0 ? "No records found" : `Showing ${start}–${end} of ${total}`}
        </div>
        {totalPages > 1 && (
          <div style={{ display: "flex", gap: ".4rem", alignItems: "center" }}>
            <button
              onClick={() => { if (page > 1) void load(page - 1, appliedSearch); }}
              disabled={page <= 1 || loading}
              style={{ padding: ".3rem .65rem", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: ".75rem", cursor: page > 1 ? "pointer" : "default", background: "#fff", color: page > 1 ? "#1d1d1f" : "#c7c7cc" }}
            >← Prev</button>
            <span style={{ fontSize: ".75rem", color: "#6e6e73" }}>Page {page} of {totalPages}</span>
            <button
              onClick={() => { if (page < totalPages) void load(page + 1, appliedSearch); }}
              disabled={page >= totalPages || loading}
              style={{ padding: ".3rem .65rem", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: ".75rem", cursor: page < totalPages ? "pointer" : "default", background: "#fff", color: page < totalPages ? "#1d1d1f" : "#c7c7cc" }}
            >Next →</button>
          </div>
        )}
      </div>

      {/* Table */}
      {!loading && !error && rows.length === 0 && (
        <div style={{ textAlign: "center", padding: "4rem 2rem", color: "#6e6e73", fontSize: ".875rem" }}>
          {hasFilters ? "No audit events match your filters." : "No audit events yet. Actions taken in the admin portal will appear here."}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #f0f0f2", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem" }}>
            <thead>
              <tr style={{ background: "#f9f9fb" }}>
                {["Time", "Campaign", "Action", "Summary", ""].map(h => (
                  <th key={h} style={{ padding: ".625rem 1rem", textAlign: "left", fontSize: ".68rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: ".05em", borderBottom: "1px solid #f0f0f2", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id}
                  style={{ borderBottom: i < rows.length - 1 ? "1px solid #f5f5f7" : "none", transition: "background .1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#fafafa")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: ".6rem 1rem", whiteSpace: "nowrap", color: "#6e6e73", fontSize: ".75rem" }} title={fullTime(row.created_at)}>
                    {relTime(row.created_at)}
                  </td>
                  <td style={{ padding: ".6rem 1rem", fontFamily: "monospace", fontSize: ".72rem", color: "#374151", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.campaign_slug ?? <span style={{ color: "#c7c7cc" }}>—</span>}
                  </td>
                  <td style={{ padding: ".6rem 1rem" }}>
                    {actionBadge(row.action)}
                  </td>
                  <td style={{ padding: ".6rem 1rem", color: "#1d1d1f", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.summary ?? <span style={{ color: "#c7c7cc" }}>—</span>}
                  </td>
                  <td style={{ padding: ".6rem 1rem" }}>
                    <button
                      onClick={() => setSelected(row)}
                      style={{ padding: ".25rem .6rem", background: "none", border: "1px solid #e5e7eb", borderRadius: 5, fontSize: ".72rem", color: "#6e6e73", cursor: "pointer" }}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Details drawer */}
      {selected && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSelected(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 100 }}
          />

          {/* Panel */}
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0,
            width: Math.min(520, window.innerWidth - 32),
            background: "#fff",
            boxShadow: "-4px 0 32px rgba(0,0,0,.14)",
            zIndex: 101,
            display: "flex", flexDirection: "column",
            overflowY: "auto",
          }}>
            {/* Panel header */}
            <div style={{ padding: "1.25rem 1.5rem .875rem", borderBottom: "1px solid #f0f0f2", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div>
                <div style={{ marginBottom: ".4rem" }}>{actionBadge(selected.action)}</div>
                <div style={{ fontSize: ".7rem", color: "#6e6e73" }}>{fullTime(selected.created_at)}</div>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{ background: "none", border: "none", fontSize: "1.2rem", color: "#6e6e73", cursor: "pointer", lineHeight: 1, padding: ".25rem" }}
              >×</button>
            </div>

            {/* Panel body */}
            <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>

              {/* Summary */}
              {selected.summary && (
                <Field label="Summary" value={selected.summary} />
              )}

              {/* Metadata grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
                {selected.campaign_slug  && <Field label="Campaign"    value={selected.campaign_slug} mono />}
                {selected.entity_type    && <Field label="Entity Type" value={selected.entity_type} />}
                {selected.entity_id      && <Field label="Entity ID"   value={selected.entity_id} mono />}
                {selected.admin_identifier && <Field label="Admin"     value={selected.admin_identifier} />}
                {selected.ip_address     && <Field label="IP Address"  value={selected.ip_address} mono />}
              </div>

              {/* User agent */}
              {selected.user_agent && (
                <Field label="User Agent" value={selected.user_agent} mono small />
              )}

              {/* Previous value */}
              {selected.previous_value != null && (
                <JsonBlock label="Previous Value" value={selected.previous_value} />
              )}

              {/* New value */}
              {selected.new_value != null && (
                <JsonBlock label="New Value" value={selected.new_value} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value, mono = false, small = false }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".25rem" }}>{label}</div>
      <div style={{ fontSize: small ? ".7rem" : ".8rem", color: "#1d1d1f", fontFamily: mono ? "monospace" : "inherit", wordBreak: "break-all" }}>{value}</div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: Record<string, unknown> }) {
  return (
    <div>
      <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".4rem" }}>{label}</div>
      <pre style={{ margin: 0, background: "#f5f5f7", borderRadius: 8, padding: ".875rem 1rem", fontSize: ".72rem", color: "#1d1d1f", overflow: "auto", maxHeight: 280, lineHeight: 1.5 }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
