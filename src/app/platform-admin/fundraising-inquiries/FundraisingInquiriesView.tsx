"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type InquiryStatus = "new" | "contacted" | "resolved";

type FundraisingInquiryRow = {
  id:                string;
  campaign_slug:     string;
  school_name:       string | null;
  sport_name:        string | null;
  season:            string | null;
  requested_by_role: "head_coach" | "assistant_coach";
  requester_name:    string | null;
  status:            InquiryStatus;
  created_at:        string;
  decided_at:        string | null;
};

type Filter = "all" | InquiryStatus;

const STATUS_BADGE: Record<InquiryStatus, { label: string; bg: string; color: string }> = {
  new:       { label: "New",       bg: "#fef3c7", color: "#92400e" },
  contacted: { label: "Contacted", bg: "#dbeafe", color: "#1e40af" },
  resolved:  { label: "Resolved",  bg: "#dcfce7", color: "#166534" },
};

const ROLE_LABEL: Record<FundraisingInquiryRow["requested_by_role"], string> = {
  head_coach:      "Head Coach",
  assistant_coach: "Assistant Coach",
};

const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: "12px", padding: "1rem 1.1rem",
  boxShadow: "0 1px 3px rgba(0,0,0,.08)", marginBottom: ".75rem",
};

function InquiryRow({ inquiry, onChanged }: { inquiry: FundraisingInquiryRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(status: "contacted" | "resolved") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/platform-admin/fundraising-inquiries/${inquiry.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to update this inquiry.");
        return;
      }
      onChanged();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const badge = STATUS_BADGE[inquiry.status];
  const teamLabel = [inquiry.school_name, inquiry.sport_name].filter(Boolean).join(" · ") || inquiry.campaign_slug;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: ".92rem", color: "#0b1e3d" }}>
            {teamLabel}
            {inquiry.season && <span style={{ color: "#9ca3af", fontWeight: 500 }}> · {inquiry.season}</span>}
          </div>
          <div style={{ fontSize: ".78rem", color: "#6b7280", marginTop: ".2rem" }}>
            {inquiry.requester_name ?? "Coach"} · {ROLE_LABEL[inquiry.requested_by_role]} · Requested {new Date(inquiry.created_at).toLocaleString()}
          </div>
        </div>
        <span style={{ fontSize: ".68rem", fontWeight: 700, padding: ".15rem .5rem", borderRadius: "999px", background: badge.bg, color: badge.color, height: "fit-content" }}>
          {badge.label}
        </span>
      </div>

      {error && <p style={{ fontSize: ".78rem", color: "#dc2626", margin: ".5rem 0 0" }}>{error}</p>}

      <div style={{ display: "flex", gap: ".5rem", marginTop: ".65rem", flexWrap: "wrap" }}>
        {inquiry.status === "new" && (
          <button disabled={busy} onClick={() => void act("contacted")} style={{ padding: ".4rem .8rem", borderRadius: 6, border: "1px solid #d1d5db", background: "transparent", fontSize: ".78rem", fontWeight: 700, cursor: "pointer" }}>
            Mark Contacted
          </button>
        )}
        {inquiry.status !== "resolved" && (
          <button disabled={busy} onClick={() => void act("resolved")} style={{ padding: ".4rem .8rem", borderRadius: 6, border: "none", background: "#0b1e3d", color: "#fff", fontSize: ".78rem", fontWeight: 700, cursor: "pointer" }}>
            Mark Resolved
          </button>
        )}
        <Link
          href={`/admin/campaigns/${inquiry.campaign_slug}`}
          style={{ padding: ".4rem .8rem", borderRadius: 6, border: "1px solid #d1d5db", background: "transparent", fontSize: ".78rem", fontWeight: 700, color: "#0b1e3d", textDecoration: "none" }}
        >
          Open Campaign Control Center
        </Link>
      </div>
    </div>
  );
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "new",       label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "resolved",  label: "Resolved" },
];

export default function FundraisingInquiriesView() {
  const [inquiries, setInquiries] = useState<FundraisingInquiryRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = () => {
    fetch("/api/platform-admin/fundraising-inquiries")
      .then(r => r.ok ? r.json() : { inquiries: [] })
      .then(d => setInquiries(d.inquiries ?? []))
      .catch(() => setInquiries([]));
  };

  useEffect(load, []);

  // Already ordered newest-first by the API (created_at.desc) — filtering
  // here never re-sorts, so that ordering is preserved regardless of which
  // tab is active.
  const visible = (inquiries ?? []).filter(i => filter === "all" || i.status === filter);
  const newCount = (inquiries ?? []).filter(i => i.status === "new").length;

  return (
    <div>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0b1e3d", margin: "0 0 1rem" }}>
        Fundraising Inquiries
      </h1>

      <div style={{ display: "flex", gap: ".4rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: ".35rem .75rem", borderRadius: 999,
              border: filter === f.key ? "1px solid #0b1e3d" : "1px solid #d1d5db",
              background: filter === f.key ? "#0b1e3d" : "transparent",
              color: filter === f.key ? "#fff" : "#374151",
              fontSize: ".78rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            {f.label}{f.key === "new" && newCount > 0 ? ` (${newCount})` : ""}
          </button>
        ))}
      </div>

      {inquiries === null ? (
        <p style={{ color: "#6b7280" }}>Loading…</p>
      ) : visible.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: "12px", padding: "2rem 1rem", textAlign: "center", color: "#6b7280" }}>
          {filter === "all" ? "No fundraising inquiries yet." : `No ${filter} inquiries.`}
        </div>
      ) : (
        visible.map(i => <InquiryRow key={i.id} inquiry={i} onChanged={load} />)
      )}
    </div>
  );
}
