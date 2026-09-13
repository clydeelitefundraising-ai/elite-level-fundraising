"use client";

import { useEffect, useState } from "react";

type ContentReport = {
  id:            string;
  campaign_slug: string;
  target_type:   "announcement" | "comment" | "message" | "attachment" | "user";
  target_id:     string;
  reporter_name: string;
  reason:        string;
  details:       string | null;
  status:        "open" | "reviewing" | "actioned" | "dismissed";
  created_at:    string;
};

const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: "12px", padding: "1rem 1.1rem",
  boxShadow: "0 1px 3px rgba(0,0,0,.08)", marginBottom: ".75rem",
};

// Phase A40: cross-campaign equivalent of ReportsPanel.tsx's
// removalEndpointFor — campaign scoping here is resolved server-side by
// the platform-admin route itself (report.campaign_slug is display-only,
// never sent as the authority for what gets removed).
function removalEndpointFor(report: ContentReport): string | null {
  if (report.target_type === "message") return `/api/platform-admin/messages/${report.target_id}/moderate-remove`;
  if (report.target_type === "attachment") return `/api/platform-admin/messages/attachments/${report.target_id}/moderate-remove`;
  return null;
}

function ReportRow({ report, onResolved }: { report: ContentReport; onResolved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function act(status: "actioned" | "dismissed") {
    setBusy(true);
    try {
      await fetch(`/api/platform-admin/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolutionNote: note.trim() || undefined }),
      });
    } finally {
      setBusy(false);
      onResolved();
    }
  }

  async function removeContent() {
    const endpoint = removalEndpointFor(report);
    if (!endpoint) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error ?? "Failed to remove content."); return; }
      await fetch(`/api/platform-admin/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "actioned", resolutionNote: note.trim() || "Content removed by moderator." }),
      });
    } catch {
      setError("Network error. Please check your connection and try again.");
      return;
    } finally {
      setBusy(false);
      onResolved();
    }
  }

  const removable = removalEndpointFor(report) !== null;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: ".92rem", color: "#0b1e3d" }}>
            {report.target_type} reported — {report.reason.replace("_", " ")}
          </div>
          <div style={{ fontSize: ".78rem", color: "#6b7280", marginTop: ".2rem" }}>
            Team: <strong>{report.campaign_slug}</strong> · Reported by {report.reporter_name} · {new Date(report.created_at).toLocaleString()}
          </div>
        </div>
        <span style={{ fontSize: ".68rem", fontWeight: 700, padding: ".15rem .5rem", borderRadius: "999px", background: "#fef3c7", color: "#92400e", height: "fit-content" }}>
          {report.status}
        </span>
      </div>

      {report.details && <p style={{ fontSize: ".82rem", color: "#374151", margin: ".5rem 0 0" }}>{report.details}</p>}
      {error && <p style={{ fontSize: ".78rem", color: "#dc2626", margin: ".4rem 0 0" }}>{error}</p>}

      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Resolution note (optional)…"
        rows={2}
        style={{ width: "100%", boxSizing: "border-box", marginTop: ".5rem", padding: ".4rem .55rem", borderRadius: 6, border: "1px solid #d1d5db", fontSize: ".8rem", fontFamily: "inherit", resize: "vertical" }}
      />

      <div style={{ display: "flex", gap: ".5rem", marginTop: ".5rem" }}>
        {removable && (
          <button
            disabled={busy}
            onClick={() => { if (confirm("Remove this content? It will be replaced with a moderator-removed placeholder and cannot be undone.")) void removeContent(); }}
            style={{ padding: ".4rem .8rem", borderRadius: 6, border: "none", background: "#dc2626", color: "#fff", fontSize: ".78rem", fontWeight: 700, cursor: "pointer" }}
          >
            Remove Content
          </button>
        )}
        <button disabled={busy} onClick={() => act("actioned")} style={{ padding: ".4rem .8rem", borderRadius: 6, border: "none", background: "#0b1e3d", color: "#fff", fontSize: ".78rem", fontWeight: 700, cursor: "pointer" }}>
          Mark Actioned
        </button>
        <button disabled={busy} onClick={() => act("dismissed")} style={{ padding: ".4rem .8rem", borderRadius: 6, border: "1px solid #d1d5db", background: "transparent", fontSize: ".78rem", fontWeight: 700, cursor: "pointer" }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function ReportsQueueView() {
  const [reports, setReports] = useState<ContentReport[] | null>(null);

  const load = () => {
    fetch("/api/platform-admin/reports")
      .then(r => r.ok ? r.json() : { reports: [] })
      .then(d => setReports(d.reports ?? []))
      .catch(() => setReports([]));
  };

  useEffect(load, []);

  const open = (reports ?? []).filter(r => r.status === "open" || r.status === "reviewing");

  return (
    <div>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0b1e3d", margin: "0 0 1rem" }}>Reports</h1>
      {reports === null ? (
        <p style={{ color: "#6b7280" }}>Loading…</p>
      ) : open.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: "12px", padding: "2rem 1rem", textAlign: "center", color: "#6b7280" }}>
          No open reports across any team.
        </div>
      ) : (
        open.map(r => <ReportRow key={r.id} report={r} onResolved={load} />)
      )}
    </div>
  );
}
