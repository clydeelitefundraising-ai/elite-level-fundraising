"use client";

import { useEffect, useState } from "react";
import type { CampaignSettings } from "@/lib/supabase";
import type { FollowUpRow, FollowUpSort, FollowUpFilter } from "@/lib/followUps";
import {
  sortFollowUpRows,
  filterFollowUpRows,
  buildFollowUpsReportTitle,
  buildFollowUpsCsv,
  buildFollowUpsCsvFilename,
  FOLLOW_UP_STATUS_LABEL,
  DEFAULT_FOLLOW_UP_SORT,
} from "@/lib/followUps";
import type { OutreachRow } from "@/lib/teamData";
import Modal from "../_components/Modal";
import PrintFollowUpsReport from "./PrintFollowUpsReport";

function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  contacted:       { bg: "#f0f4ff", color: "#1d4ed8" },
  needs_follow_up: { bg: "#fef3c7", color: "#b45309" },
  resolved:        { bg: "#dcfce7", color: "#16a34a" },
};

const SORT_OPTIONS: { value: FollowUpSort; label: string }[] = [
  { value: "contacts_asc",  label: "Contacts: Lowest → Highest" },
  { value: "contacts_desc", label: "Contacts: Highest → Lowest" },
  { value: "raised_asc",    label: "Funds Raised: Lowest → Highest" },
  { value: "raised_desc",   label: "Funds Raised: Highest → Lowest" },
];

// Phase 6: Fundraiser → Follow-Ups. Roster-first: `initialRows` is
// already built by buildFollowUpRows() server-side from the complete
// roster (see page.tsx) — this component only sorts/filters/displays,
// it never re-derives which athletes exist.
export default function FollowUpsView({
  slug,
  settings,
  initialRows,
}: {
  slug: string;
  settings: CampaignSettings;
  initialRows: FollowUpRow[];
}) {
  const [rows, setRows] = useState<FollowUpRow[]>(initialRows);
  const [sort, setSort] = useState<FollowUpSort>(DEFAULT_FOLLOW_UP_SORT);
  const [filter, setFilter] = useState<FollowUpFilter>("all");
  const [updateAthlete, setUpdateAthlete] = useState<FollowUpRow | null>(null);
  const [historyAthlete, setHistoryAthlete] = useState<FollowUpRow | null>(null);

  // Print always consumes exactly this same sorted+filtered array — no
  // independent query, no re-sort — so it matches the coach's current
  // working view by construction.
  const sortedRows   = sortFollowUpRows(rows, sort);
  const visibleRows  = filterFollowUpRows(sortedRows, filter);
  const reportTitle  = buildFollowUpsReportTitle(filter, visibleRows.length, rows.length);

  const applyOutreachUpdate = (athleteId: string, status: OutreachRow["status"], note: string | null, createdAt: string) => {
    setRows(prev => prev.map(r =>
      r.id === athleteId ? { ...r, outreachStatus: status, outreachNote: note, outreachAt: createdAt } : r,
    ));
  };

  // Same visibleRows the on-screen list and Print render — exported file
  // always matches the coach's current sort/filter, never a separate query.
  const handleExport = () => {
    const csv = buildFollowUpsCsv(visibleRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildFollowUpsCsvFilename(settings.school_name, settings.sport_name);
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <style>{`
        @media print {
          #elf-team-header, [role="navigation"] { display: none !important; }
          .elf-followups-noprint { display: none !important; }
          .elf-followups-print { display: block !important; }
        }
        @media screen {
          .elf-followups-print { display: none; }
        }
      `}</style>

      <div className="elf-followups-print">
        <PrintFollowUpsReport
          title={reportTitle}
          schoolName={settings.school_name}
          sportName={settings.sport_name}
          season={settings.season ?? null}
          rows={visibleRows}
          primaryColor={settings.primary_color}
        />
      </div>

      <div className="elf-followups-noprint">
        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".65rem", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em" }}>
            Follow-Ups
          </h2>
          <span style={{ background: "#f3f4f6", color: "#6b7280", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem" }}>
            {rows.length} athlete{rows.length !== 1 ? "s" : ""}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={handleExport} style={printBtn}>
            Export Athlete Report
          </button>
          <button onClick={() => window.print()} style={printBtnGhost}>
            Print Athlete Report
          </button>
        </div>

        {/* ── Sort / Filter ── */}
        <div style={{ display: "flex", gap: ".5rem", marginBottom: ".75rem", flexWrap: "wrap" }}>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as FollowUpSort)}
            style={selectStyle}
            aria-label="Sort athletes"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <div role="tablist" aria-label="Filter athletes" style={{ display: "inline-flex", background: "#f3f4f6", borderRadius: 9, padding: 3, gap: 2 }}>
            {([{ id: "all" as const, label: "All Athletes" }, { id: "needs_follow_up" as const, label: "Needs Follow Up" }]).map(f => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: ".4rem .8rem", borderRadius: 7, border: "none", cursor: "pointer",
                  fontSize: ".78rem", fontWeight: 700,
                  background: filter === f.id ? "#fff" : "transparent",
                  color: filter === f.id ? "#0b1e3d" : "#6b7280",
                  boxShadow: filter === f.id ? "0 1px 3px rgba(0,0,0,.1)" : "none",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── List ── */}
        {visibleRows.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 14, padding: "2.5rem 1.5rem", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)" }}>
            <div style={{ fontSize: "1.75rem", marginBottom: ".5rem", opacity: .35 }}>✅</div>
            <p style={{ margin: 0, fontSize: ".85rem", color: "#9ca3af" }}>
              {filter === "needs_follow_up" ? "No athletes currently need follow-up." : "No athletes on the roster yet."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
            {visibleRows.map(r => {
              const badge = r.outreachStatus ? STATUS_STYLE[r.outreachStatus] : null;
              return (
                <div key={r.id} style={{
                  background: "#fff", borderRadius: 12, padding: ".75rem .9rem",
                  boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
                  display: "flex", flexDirection: "column", gap: ".4rem",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: ".92rem", color: "#111827", flex: 1, minWidth: 120 }}>
                      {r.name}
                    </span>
                    {badge ? (
                      <span style={{ background: badge.bg, color: badge.color, borderRadius: 100, fontSize: ".62rem", fontWeight: 700, padding: ".15rem .55rem", textTransform: "uppercase", letterSpacing: ".03em" }}>
                        {FOLLOW_UP_STATUS_LABEL[r.outreachStatus!]}
                      </span>
                    ) : (
                      <span style={{ color: "#c1c7d0", fontSize: ".78rem" }}>—</span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "1rem", fontSize: ".8rem", color: "#6b7280", flexWrap: "wrap" }}>
                    <span><strong style={{ color: "#111827" }}>{r.contacts}</strong> contact{r.contacts !== 1 ? "s" : ""}</span>
                    <span><strong style={{ color: "#111827" }}>{fmtCents(r.raisedCents)}</strong> raised</span>
                    {r.outreachAt && <span>Last: {fmtDate(r.outreachAt)}</span>}
                  </div>

                  <div style={{ display: "flex", gap: ".5rem" }}>
                    <button onClick={() => setUpdateAthlete(r)} style={smallBtn}>Update</button>
                    <button onClick={() => setHistoryAthlete(r)} style={smallBtnGhost}>View History</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {updateAthlete && (
        <UpdateFollowUpModal
          slug={slug}
          athlete={updateAthlete}
          onClose={() => setUpdateAthlete(null)}
          onSaved={(status, note, createdAt) => {
            applyOutreachUpdate(updateAthlete.id, status, note, createdAt);
            setUpdateAthlete(null);
          }}
        />
      )}

      {historyAthlete && (
        <FollowUpHistoryModal slug={slug} athlete={historyAthlete} onClose={() => setHistoryAthlete(null)} />
      )}
    </>
  );
}

// ── Update modal ─────────────────────────────────────────────────────────

function UpdateFollowUpModal({
  slug,
  athlete,
  onClose,
  onSaved,
}: {
  slug: string;
  athlete: FollowUpRow;
  onClose: () => void;
  onSaved: (status: OutreachRow["status"], note: string | null, createdAt: string) => void;
}) {
  const [status, setStatus] = useState<OutreachRow["status"]>(athlete.outreachStatus ?? "contacted");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true); setError("");
    const res = await fetch(`/api/team/${slug}/outreach/${athlete.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note: note.trim() || undefined }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to save."); return; }
    onSaved(data.status, data.note ?? null, data.created_at);
  };

  return (
    <Modal title={`Update — ${athlete.name}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
        <label style={lbl}>
          Status
          <select value={status} onChange={e => setStatus(e.target.value as OutreachRow["status"])} style={inp}>
            <option value="contacted">Contacted</option>
            <option value="needs_follow_up">Needs Follow Up</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label style={lbl}>
          Note (optional)
          <textarea value={note} onChange={e => setNote(e.target.value)} style={{ ...inp, minHeight: 80, resize: "vertical" }} placeholder="e.g. Only 3 contacts entered. Asked athlete to add more tonight." />
        </label>
        {error && <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>{error}</p>}
        <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={smallBtnGhost}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ ...smallBtn, opacity: saving ? .7 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── History modal ────────────────────────────────────────────────────────

function FollowUpHistoryModal({ slug, athlete, onClose }: { slug: string; athlete: FollowUpRow; onClose: () => void }) {
  const [history, setHistory] = useState<OutreachRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/team/${slug}/outreach/${athlete.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (!cancelled) setHistory(d); })
      .catch(() => { if (!cancelled) setHistory([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount for this fixed athlete/slug pair, same pattern as EnterCodeView.tsx
  }, []);

  return (
    <Modal title={`History — ${athlete.name}`} onClose={onClose}>
      {loading ? (
        <p style={{ fontSize: ".85rem", color: "#6b7280", textAlign: "center", margin: "1rem 0" }}>Loading…</p>
      ) : !history || history.length === 0 ? (
        <p style={{ fontSize: ".85rem", color: "#9ca3af", textAlign: "center", margin: "1rem 0" }}>No follow-up history yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".7rem" }}>
          {history.map(h => {
            const badge = STATUS_STYLE[h.status];
            return (
              <div key={h.id} style={{ borderLeft: `3px solid ${badge.color}`, paddingLeft: ".7rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".15rem" }}>
                  <span style={{ background: badge.bg, color: badge.color, borderRadius: 100, fontSize: ".6rem", fontWeight: 700, padding: ".12rem .5rem", textTransform: "uppercase" }}>
                    {FOLLOW_UP_STATUS_LABEL[h.status]}
                  </span>
                  <span style={{ fontSize: ".72rem", color: "#9ca3af" }}>{fmtDate(h.created_at)}{h.contacted_by ? ` · ${h.contacted_by}` : ""}</span>
                </div>
                {h.note && <p style={{ margin: 0, fontSize: ".82rem", color: "#374151", lineHeight: 1.5 }}>{h.note}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ── Style tokens ──────────────────────────────────────────────────────────

const printBtn: React.CSSProperties = {
  padding: ".45rem .8rem", background: "#0b1e3d", color: "#fff", border: "none",
  borderRadius: 8, fontSize: ".8rem", fontWeight: 700, cursor: "pointer",
};

const printBtnGhost: React.CSSProperties = {
  padding: ".45rem .8rem", background: "#f3f4f6", color: "#374151", border: "none",
  borderRadius: 8, fontSize: ".8rem", fontWeight: 700, cursor: "pointer",
};

const selectStyle: React.CSSProperties = {
  padding: ".45rem .65rem", border: "1.5px solid #e5e7eb", borderRadius: 9,
  fontSize: ".78rem", fontWeight: 600, color: "#374151", background: "#fff",
};

const smallBtn: React.CSSProperties = {
  padding: ".4rem .75rem", background: "#0b1e3d", color: "#fff", border: "none",
  borderRadius: 8, fontSize: ".76rem", fontWeight: 700, cursor: "pointer",
};

const smallBtnGhost: React.CSSProperties = {
  padding: ".4rem .75rem", background: "#f3f4f6", color: "#374151", border: "none",
  borderRadius: 8, fontSize: ".76rem", fontWeight: 700, cursor: "pointer",
};

const inp: React.CSSProperties = {
  padding: ".5rem .75rem", border: "1.5px solid #e5e7eb", borderRadius: 9,
  // 16px minimum — iOS WebKit auto-zooms the viewport when focusing a form
  // control smaller than this (Phase 8).
  fontSize: "1rem", width: "100%", boxSizing: "border-box", color: "#111827", background: "#fff",
};

const lbl: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: ".3rem", fontSize: ".72rem", fontWeight: 700,
  color: "#374151", textTransform: "uppercase", letterSpacing: ".05em",
};
