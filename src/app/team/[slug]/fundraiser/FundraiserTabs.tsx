"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { TeamActor } from "@/lib/permissions";
import { shouldShowDesktopFundraiserFollowUps } from "./fundraiserHelpers";
import styles from "./Fundraiser.module.css";

type Tab = "overview" | "followups";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",  label: "Overview" },
  { id: "followups", label: "Follow-Ups" },
];

// Phase 6: thin segmented-tab wrapper, same pattern as
// CommunicationsView.tsx — receives already-rendered server output for
// each tab as children/props rather than reimplementing either view, and
// is deep-linkable via ?tab= exactly like Communications' ?tab=. Overview
// is the unchanged existing Fundraiser experience (TeamCampaignView +
// AnalyticsView, or just TeamCampaignView for the booster branch); this
// component does not know or care what's inside either tab.
//
// D6: at desktop widths, a coach-eligible actor
// (shouldShowDesktopFundraiserFollowUps — the same isCoachOnly-based
// boundary the desktop Follow-Ups table itself uses) sees a compact
// horizontal secondary-nav instead of this segmented control, identical
// pattern/reasoning to D3a's TeamTabs.tsx and D5a's CommunicationsView.tsx
// compact nav. Booster/Parent/Athlete, and EVERY actor on mobile
// (including coaches), keep the original segmented control unchanged —
// same CSS-only mobileOnly/desktopOnly toggle as the rest of D1-D6. Tab
// state (`tab`) and ?tab= routing are shared by both renderings; this
// only changes which nav UI is shown, never the tab-switching/routing
// behavior itself. Both nav variants keep the elf-followups-noprint class
// so printing hides navigation regardless of which is on screen.
export default function FundraiserTabs({
  overview,
  followUps,
  actor,
}: {
  overview: ReactNode;
  followUps: ReactNode;
  actor: TeamActor;
}) {
  const searchParams = useSearchParams();
  const initialTab: Tab = searchParams.get("tab") === "followups" ? "followups" : "overview";
  const [tab, setTab] = useState<Tab>(initialTab);
  const showCompactDesktopNav = shouldShowDesktopFundraiserFollowUps(actor);

  const segmentedControl = (
    <div
      role="tablist"
      aria-label="Fundraiser section"
      className="elf-followups-noprint"
      style={{
        display: "inline-flex", background: "#f3f4f6", borderRadius: 10, padding: 3,
        marginBottom: ".85rem", gap: 2,
      }}
    >
      {TABS.map(({ id, label }) => (
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
  );

  const compactDesktopNav = (
    <div
      role="tablist"
      aria-label="Fundraiser section"
      className="elf-followups-noprint"
      style={{ display: "flex", gap: "1.5rem", borderBottom: "1px solid #e5e7eb", marginBottom: "1rem" }}
    >
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          role="tab"
          aria-selected={tab === id}
          onClick={() => setTab(id)}
          style={{
            background: "none",
            border: "none",
            borderBottom: tab === id ? "2px solid #0b1e3d" : "2px solid transparent",
            cursor: "pointer",
            padding: ".6rem 0",
            fontSize: ".85rem",
            fontWeight: tab === id ? 700 : 500,
            color: tab === id ? "#0b1e3d" : "#6b7280",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      {showCompactDesktopNav ? (
        <>
          <div className={styles.mobileOnly}>{segmentedControl}</div>
          <div className={styles.desktopOnly}>{compactDesktopNav}</div>
        </>
      ) : (
        segmentedControl
      )}

      {tab === "overview" ? overview : followUps}
    </div>
  );
}
