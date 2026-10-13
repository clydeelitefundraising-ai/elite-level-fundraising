"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { SponsorRow } from "@/lib/teamData";
import type { TeamActor } from "@/lib/permissions";
import type { ActiveCommunityPartner } from "@/lib/platform/communityPartners";
import SponsorsView from "./SponsorsView";
import CommunityPartnersListView from "./CommunityPartnersListView";
import { getPartnersTabs, resolveActivePartnersTab } from "./partnersTabs";

// Phase 2.1 — thin segmented-tab wrapper around the existing, unmodified
// SponsorsView, same pattern as FundraiserTabs.tsx/TeamTabs.tsx (?tab=
// deep-linkable, local useState after the initial read — tab switching is
// never a router/URL change, so it can never trigger a new server render
// or a new data fetch). SponsorsView receives the exact same
// slug/initialSponsors/actor props page.tsx already passed it before this
// phase — no new queries, no behavior change to the Team Sponsors tab.
//
// Phase 2.2C — `showCommunityPartners` (the school's setting, resolved
// server-side in page.tsx) now decides whether the tab switcher renders
// at all. When false, this renders ONLY SponsorsView, directly, with no
// tablist chrome — per the approved decision, Team Sponsors must stay
// fully visible and functional with zero trace of a feature the school
// hasn't turned on, not a grayed-out or disabled tab hinting at it.
export default function PartnersView({
  slug,
  initialSponsors,
  actor,
  showCommunityPartners,
  activePartners,
}: {
  slug: string;
  initialSponsors: SponsorRow[];
  actor: TeamActor;
  showCommunityPartners: boolean;
  activePartners: ActiveCommunityPartner[];
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(() =>
    resolveActivePartnersTab(searchParams.get("tab"), showCommunityPartners),
  );

  if (!showCommunityPartners) {
    return (
      <div style={{ animation: "elf-fadeUp .22s ease both", maxWidth: 820, margin: "0 auto" }}>
        <SponsorsView slug={slug} initialSponsors={initialSponsors} actor={actor} />
      </div>
    );
  }

  const tabs = getPartnersTabs(true);

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
        {tabs.map(({ key, label }) => (
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
        {tab === "community" && <CommunityPartnersListView partners={activePartners} />}
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
