"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { TeamActor } from "@/lib/permissions";
import { shouldShowDesktopRoster } from "./rosterHelpers";
import styles from "./Team.module.css";

type Tab = "overview" | "roster" | "clearance";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",  label: "Overview" },
  { id: "roster",    label: "Roster" },
  { id: "clearance", label: "Clearance" },
];

// Phase 7: Team Hub top-level tabs, same thin segmented-tab pattern as
// FundraiserTabs.tsx / CommunicationsView.tsx — receives already-rendered
// server output for each tab as props, deep-linkable via ?tab=. Default is
// "overview" per spec.
//
// D3a: at desktop widths, a coach-eligible actor (shouldShowDesktopRoster —
// the same isCoachOnly-based boundary the desktop roster table itself
// uses) sees a compact horizontal secondary-nav instead of this segmented
// control, since the segmented bar reads as oversized next to the new
// desktop roster workspace. Booster/Athlete/Parent, and EVERY actor on
// mobile (including coaches), keep the original segmented control
// unchanged — same CSS-only mobileOnly/desktopOnly toggle as the rest of
// D1/D2/D3, no window.innerWidth. Route/tab state (`tab`) is shared by
// both renderings; this only changes which nav UI is shown, never the
// tab-switching behavior itself.
export default function TeamTabs({
  overview,
  roster,
  clearance,
  actor,
}: {
  overview:  ReactNode;
  roster:    ReactNode;
  clearance: ReactNode;
  actor: TeamActor;
}) {
  const searchParams = useSearchParams();
  const initial: Tab =
    searchParams.get("tab") === "roster"    ? "roster" :
    searchParams.get("tab") === "clearance" ? "clearance" :
    "overview";
  const [tab, setTab] = useState<Tab>(initial);
  const showCompactDesktopNav = shouldShowDesktopRoster(actor);

  const segmentedControl = (
    <div
      role="tablist"
      aria-label="Team section"
      style={{
        display: "flex", background: "#f3f4f6", borderRadius: 10, padding: 3,
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
  );

  const compactDesktopNav = (
    <div
      role="tablist"
      aria-label="Team section"
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

      {tab === "overview" && overview}
      {tab === "roster" && roster}
      {tab === "clearance" && clearance}
    </div>
  );
}
