"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

type Tab = "overview" | "followups";

// Phase 6: thin segmented-tab wrapper, same pattern as
// CommunicationsView.tsx — receives already-rendered server output for
// each tab as children/props rather than reimplementing either view, and
// is deep-linkable via ?tab= exactly like Communications' ?tab=. Overview
// is the unchanged existing Fundraiser experience (TeamCampaignView +
// AnalyticsView, or just TeamCampaignView for the booster branch); this
// component does not know or care what's inside either tab.
export default function FundraiserTabs({
  overview,
  followUps,
}: {
  overview: ReactNode;
  followUps: ReactNode;
}) {
  const searchParams = useSearchParams();
  const initialTab: Tab = searchParams.get("tab") === "followups" ? "followups" : "overview";
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div>
      <div
        role="tablist"
        aria-label="Fundraiser section"
        className="elf-followups-noprint"
        style={{
          display: "inline-flex", background: "#f3f4f6", borderRadius: 10, padding: 3,
          marginBottom: ".85rem", gap: 2,
        }}
      >
        {([
          { id: "overview" as const,  label: "Overview" },
          { id: "followups" as const, label: "Follow-Ups" },
        ]).map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            style={{
              padding: ".4rem .95rem",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: ".8rem",
              fontWeight: 700,
              background: tab === id ? "#fff" : "transparent",
              color: tab === id ? "#0b1e3d" : "#6b7280",
              boxShadow: tab === id ? "0 1px 3px rgba(0,0,0,.1)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? overview : followUps}
    </div>
  );
}
