"use client";

import { useState } from "react";
import type { ExportCampaign } from "./page";

type Props = { campaigns: ExportCampaign[] };

type ExportDef = {
  id:     string;
  icon:   string;
  title:  string;
  desc:   string;
  fields: string[];
};

const EXPORTS: ExportDef[] = [
  {
    id:     "donations",
    icon:   "💳",
    title:  "Donation Report",
    desc:   "Complete donation ledger with donor info, amounts, athlete attribution, and Stripe session references.",
    fields: ["Campaign", "School · Sport · Season", "Donor name", "Amount (USD)", "Date", "Athlete name", "Stripe session ID", "Donation message"],
  },
  {
    id:     "contacts",
    icon:   "📋",
    title:  "Contact Collection Report",
    desc:   "All fundraising contacts collected by athletes across selected campaigns.",
    fields: ["Campaign", "School", "Athlete name", "First name", "Last name", "Phone", "Email", "Relationship", "Date added"],
  },
  {
    id:     "registration",
    icon:   "✅",
    title:  "Registration Status Report",
    desc:   "Per-athlete onboarding progress: account, parent link, profile photo, contacts, and donations.",
    fields: ["Campaign", "Athlete", "Event", "Account created", "Parent linked", "Photo uploaded", "Contacts", "Contact goal", "Goal met", "Total raised ($)"],
  },
  {
    id:     "campaigns",
    icon:   "📊",
    title:  "Campaign Summary Report",
    desc:   "High-level summary for each campaign: fundraising totals, roster, members, and engagement metrics.",
    fields: ["Campaign slug", "School", "Sport", "Season", "Location", "Goal ($)", "Raised ($)", "% to goal", "Donations", "Athletes", "Members", "Contacts", "Deadline", "Status"],
  },
];

function fmtLabel(c: ExportCampaign) {
  const parts = [c.school_name, c.sport_name, c.season].filter(Boolean).join(" · ");
  return parts + (c.archived ? " (archived)" : "");
}

export default function ExportsView({ campaigns }: Props) {
  const [campaign, setCampaign] = useState("all");

  const dlUrl = (id: string) =>
    `/api/admin/exports/${id}?campaign=${encodeURIComponent(campaign)}`;

  return (
    <div style={{ padding: "1.75rem 2rem", maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <h2 style={{ margin: "0 0 .3rem", fontSize: "1rem", fontWeight: 700, color: "#1d1d1f" }}>
          Export Center
        </h2>
        <p style={{ margin: 0, fontSize: ".82rem", color: "#6e6e73", lineHeight: 1.5 }}>
          Download campaign data as CSV files. No passwords, tokens, or credentials are included in any export.
        </p>
      </div>

      {/* Scope selector */}
      <div style={{
        background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
        padding: "1rem 1.25rem", marginBottom: "1.5rem",
        display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap",
      }}>
        <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: ".05em", whiteSpace: "nowrap" }}>
          Export scope
        </span>
        <select
          value={campaign}
          onChange={e => setCampaign(e.target.value)}
          style={{
            padding: ".42rem .65rem", border: "1px solid #d1d5db", borderRadius: 7,
            fontSize: ".82rem", color: "#1d1d1f", background: "#fff", outline: "none",
            cursor: "pointer", minWidth: 260, flex: 1, maxWidth: 400,
          }}
        >
          <option value="all">All campaigns</option>
          {campaigns.map(c => (
            <option key={c.campaign_slug} value={c.campaign_slug}>
              {fmtLabel(c)}
            </option>
          ))}
        </select>
        {campaign !== "all" && (
          <button
            onClick={() => setCampaign("all")}
            style={{ fontSize: ".72rem", color: "#6366f1", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0, whiteSpace: "nowrap" }}
          >
            Clear filter
          </button>
        )}
        {campaign !== "all" && (
          <span style={{ fontSize: ".72rem", color: "#98989d", fontStyle: "italic" }}>
            Scoped to: {campaigns.find(c => c.campaign_slug === campaign)?.school_name ?? campaign}
          </span>
        )}
      </div>

      {/* Empty state */}
      {campaigns.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, border: "1px solid #f0f0f2",
          padding: "3.5rem", textAlign: "center",
        }}>
          <div style={{ fontSize: "2.5rem", marginBottom: ".75rem" }}>📭</div>
          <div style={{ fontSize: ".9rem", fontWeight: 700, color: "#1d1d1f", marginBottom: ".35rem" }}>
            No campaigns yet
          </div>
          <div style={{ fontSize: ".8rem", color: "#98989d" }}>
            Create your first campaign to unlock data exports.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {EXPORTS.map(exp => (
            <ExportCard key={exp.id} exp={exp} url={dlUrl(exp.id)} scope={campaign} />
          ))}
        </div>
      )}

      {/* Footer note */}
      {campaigns.length > 0 && (
        <div style={{ marginTop: "1.5rem", fontSize: ".72rem", color: "#c7c7cc", lineHeight: 1.6 }}>
          Files are generated fresh on each download. Large campaigns may take a few seconds.
          Exports include data only — no authentication credentials, hashed passwords, push tokens, or session cookies are ever included.
        </div>
      )}
    </div>
  );
}

function ExportCard({ exp, url, scope }: { exp: ExportDef; url: string; scope: string }) {
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Download failed." }));
        setError((body as { error?: string }).error ?? "Download failed.");
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      const slug = scope === "all" ? "all-campaigns" : scope;
      a.href     = href;
      a.download = `elf-${exp.id}-${slug}-${date}.csv`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #f0f0f2",
      padding: "1.25rem 1.5rem", display: "flex", alignItems: "flex-start", gap: "1.25rem",
    }}>
      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 11, background: "#f5f5f7",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "1.3rem", flexShrink: 0,
      }}>
        {exp.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: ".9rem", fontWeight: 700, color: "#1d1d1f", marginBottom: ".25rem" }}>
          {exp.title}
        </div>
        <div style={{ fontSize: ".78rem", color: "#6e6e73", lineHeight: 1.5, marginBottom: ".65rem" }}>
          {exp.desc}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".3rem" }}>
          {exp.fields.map(f => (
            <span key={f} style={{
              fontSize: ".65rem", fontWeight: 600, color: "#6e6e73",
              background: "#f5f5f7", padding: ".15rem .5rem", borderRadius: 4,
            }}>
              {f}
            </span>
          ))}
        </div>
        {error && (
          <div style={{ marginTop: ".5rem", fontSize: ".75rem", color: "#dc2626", fontWeight: 500 }}>
            {error}
          </div>
        )}
      </div>

      {/* Download button */}
      <button
        onClick={download}
        disabled={busy}
        style={{
          padding: ".45rem 1.1rem",
          background: busy ? "#f3f4f6" : "#0b1e3d",
          color: busy ? "#9ca3af" : "#fff",
          border: "none", borderRadius: 8,
          cursor: busy ? "not-allowed" : "pointer",
          fontSize: ".78rem", fontWeight: 600,
          whiteSpace: "nowrap", flexShrink: 0,
          transition: "background .12s",
        }}
      >
        {busy ? "Preparing…" : "↓ Download CSV"}
      </button>
    </div>
  );
}
