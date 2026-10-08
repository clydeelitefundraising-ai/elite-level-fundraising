"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { SponsorRow } from "@/lib/teamData";
import type { TeamActor } from "@/lib/permissions";
import SponsorsView from "./SponsorsView";
import CommunityPartnersEmptyState from "./CommunityPartnersEmptyState";
import { PARTNERS_TABS, resolveActivePartnersTab } from "./partnersTabs";

// Phase 2.1 — thin segmented-tab wrapper around the existing, unmodified
// SponsorsView, same pattern as FundraiserTabs.tsx/TeamTabs.tsx (?tab=
// deep-linkable, local useState after the initial read — tab switching is
// never a router/URL change, so it can never trigger a new server render
// or a new data fetch). SponsorsView receives the exact same
// slug/initialSponsors/actor props page.tsx already passed it before this
// phase — no new queries, no behavior change to the Team Sponsors tab.
export default function PartnersView({
  slug,
  initialSponsors,
  actor,
}: {
  slug: string;
  initialSponsors: SponsorRow[];
  actor: TeamActor;
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(() => resolveActivePartnersTab(searchParams.get("tab")));

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both", maxWidth: 820, margin: "0 auto" }}>
      <div
        role="tablist"
        aria-label="Partners section"
        style={{
          display: "inline-flex", background: "#f3f4f6", borderRadius: 10, padding: 3,
          marginBottom: ".85rem", gap: 2,
        }}
      >
        {PARTNERS_TABS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            id={`partners-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`partners-panel-${key}`}
            onClick={() => setTab(key)}
            className="elf-focus-ring"
            style={{
              padding: ".4rem .75rem",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: ".8rem",
              fontWeight: 700,
              whiteSpace: "nowrap",
              background: tab === key ? "#fff" : "transparent",
              color: tab === key ? "#111827" : "#6b7280",
              boxShadow: tab === key ? "0 1px 3px rgba(0,0,0,.1)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="partners-panel-community"
        aria-labelledby="partners-tab-community"
        hidden={tab !== "community"}
      >
        {tab === "community" && <CommunityPartnersEmptyState />}
      </div>

      <div
        role="tabpanel"
        id="partners-panel-team"
        aria-labelledby="partners-tab-team"
        hidden={tab !== "team"}
      >
        {tab === "team" && (
          <SponsorsView slug={slug} initialSponsors={initialSponsors} actor={actor} />
        )}
      </div>
    </div>
  );
}
