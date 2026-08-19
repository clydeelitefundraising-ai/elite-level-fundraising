"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

type Tab = "overview" | "roster" | "clearance";

// Phase 7: Team Hub top-level tabs, same thin segmented-tab pattern as
// FundraiserTabs.tsx / CommunicationsView.tsx — receives already-rendered
// server output for each tab as props, deep-linkable via ?tab=. Default is
// "overview" per spec.
export default function TeamTabs({
  overview,
  roster,
  clearance,
}: {
  overview:  ReactNode;
  roster:    ReactNode;
  clearance: ReactNode;
}) {
  const searchParams = useSearchParams();
  const initial: Tab =
    searchParams.get("tab") === "roster"    ? "roster" :
    searchParams.get("tab") === "clearance" ? "clearance" :
    "overview";
  const [tab, setTab] = useState<Tab>(initial);

  return (
    <div>
      <div
        role="tablist"
        aria-label="Team section"
        style={{
          display: "flex", background: "#f3f4f6", borderRadius: 10, padding: 3,
          marginBottom: ".85rem", gap: 2,
        }}
      >
        {([
          { id: "overview" as const,  label: "Overview" },
          { id: "roster" as const,    label: "Roster" },
          { id: "clearance" as const, label: "Clearance" },
        ]).map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            style={{
              flex: 1,
              padding: ".4rem .5rem",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: ".8rem",
              fontWeight: 700,
              background: tab === id ? "#fff" : "transparent",
              color: tab === id ? "#0b1e3d" : "#6b7280",
              boxShadow: tab === id ? "0 1px 3px rgba(0,0,0,.1)" : "none",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && overview}
      {tab === "roster" && roster}
      {tab === "clearance" && clearance}
    </div>
  );
}
