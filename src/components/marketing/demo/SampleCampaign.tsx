"use client";

import { useEffect, useState } from "react";
import PublicCampaignPage from "@/app/campaign/_shared/PublicCampaignPage";
import { publicLeaderboardFilters } from "@/lib/athleteClass";
import {
  SAMPLE_ATHLETES, SAMPLE_CAMPAIGN, SAMPLE_COACHES, SAMPLE_DONATIONS, SAMPLE_FUND_USES,
  SAMPLE_PREVIEW_PARTNERS, SAMPLE_TEAM, SAMPLE_ME, sampleAvatarFor, samplePortraitFor,
} from "./fixtures";

// The fundraising preview: the REAL public campaign page component, fed
// fictional sample data (./fixtures). The same local state the live page
// keeps (amount, filters, leaderboard expansion…) so it behaves like the
// real thing — but there is no fetch, no Stripe, no checkout and no write
// of any kind: "Donate" only explains that this is a preview. The crest,
// portraits, avatars and partner logos are invented static artwork
// (scripts/marketing/sample-assets.mjs) passed in through the page's
// optional image props, so not even a photo request hits the server.

type Coach = { id: string; name: string; role: "head_coach" | "assistant_coach"; raised: number; goal_cents: number | null };

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`;
}

export const PREVIEW_DONATE_MESSAGE = "Preview only — donations are turned off on this sample page. No payment is taken.";

export function SampleCampaign({ view }: { view: "team" | "athlete" }) {
  const [selectedAmount, setSelectedAmount] = useState("$50");
  const [customAmount, setCustomAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [selectedAthleteId, setSelectedAthleteId] = useState(view === "athlete" ? SAMPLE_ME.id : "");
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [donationMessage, setDonationMessage] = useState("");
  const [donateError, setDonateError] = useState("");
  const [activeFilter, setActiveFilter] = useState("Overall");
  const [participantFilter, setParticipantFilter] = useState<"All" | "Athletes" | "Coaches">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false);
  const [donationsExpanded, setDonationsExpanded] = useState(false);

  // Same theme variables the live page sets, from the sample team colors.
  useEffect(() => {
    const root = document.documentElement;
    const p = SAMPLE_TEAM.primaryColor;
    const s = SAMPLE_TEAM.secondaryColor;
    for (const [k, v] of [["primary", p], ["secondary", s], ["accent", s], ["button", p]] as const) {
      root.style.setProperty(`--cl-${k}`, v);
      root.style.setProperty(`--cl-${k}-rgb`, hexToRgb(v));
    }
  }, []);

  const athletes = [...SAMPLE_ATHLETES]
    .sort((a, b) => b.raised - a.raised)
    .map((a, i) => ({ id: a.id, rank: i + 1, name: a.name, event: a.event, class_year: a.class_year, raised: a.raised }));
  const coaches: Coach[] = SAMPLE_COACHES;

  const filters = publicLeaderboardFilters(athletes.map((a) => a.class_year));
  const effectiveFilter = filters.includes(activeFilter) ? activeFilter : "Overall";
  const combined = [
    ...athletes.map((a) => ({ ...a, kind: "athlete" as const, role: undefined as Coach["role"] | undefined })),
    ...coaches.map((c) => ({ id: c.id, name: c.name, event: null, class_year: null, raised: c.raised, rank: 0, kind: "coach" as const, role: c.role })),
  ].sort((a, b) => b.raised - a.raised).map((e, i) => ({ ...e, rank: i + 1 }));
  const filteredAthletes = (
    effectiveFilter !== "Overall"
      ? athletes.filter((a) => a.class_year === effectiveFilter).map((a) => ({ ...a, kind: "athlete" as const, role: undefined as Coach["role"] | undefined }))
      : participantFilter === "Athletes" ? combined.filter((e) => e.kind === "athlete")
      : participantFilter === "Coaches" ? combined.filter((e) => e.kind === "coach")
      : combined
  ).map((a, i) => ({ ...a, displayRank: i + 1 }));

  const displayAmount = selectedAmount === "Custom" ? (customAmount ? `$${customAmount}` : "Custom Amount") : selectedAmount;
  const selectedAthleteName = athletes.find((a) => a.id === selectedAthleteId)?.name ?? "";
  const selectedCoachName = coaches.find((c) => c.id === selectedCoachId)?.name ?? "";
  const donateLabel = selectedAthleteId
    ? `Donate ${displayAmount} for ${selectedAthleteName} →`
    : selectedCoachId
      ? `Donate ${displayAmount} for Coach ${selectedCoachName} →`
      : `Donate ${displayAmount} to the ${SAMPLE_TEAM.mascot} →`;

  const me = athletes.find((a) => a.id === SAMPLE_ME.id)!;

  return (
    <PublicCampaignPage
      slug={SAMPLE_TEAM.slug}
      schoolName={SAMPLE_TEAM.schoolName}
      sportName={SAMPLE_TEAM.sportName}
      mascot={SAMPLE_TEAM.mascot}
      themePrimaryColor={SAMPLE_TEAM.primaryColor}
      location={SAMPLE_TEAM.location}
      season={SAMPLE_TEAM.season}
      logoUrl={SAMPLE_TEAM.logoUrl}
      description={SAMPLE_TEAM.description}
      raised={SAMPLE_CAMPAIGN.raised}
      donors={SAMPLE_CAMPAIGN.donors}
      goal={SAMPLE_CAMPAIGN.goal}
      daysLeft={SAMPLE_CAMPAIGN.daysLeft}
      percent={Math.round((SAMPLE_CAMPAIGN.raised / SAMPLE_CAMPAIGN.goal) * 100)}
      athletes={athletes}
      filteredAthletes={filteredAthletes}
      filters={filters}
      activeFilter={effectiveFilter}
      setActiveFilter={setActiveFilter}
      coaches={coaches}
      allowCoachFundraising
      selectedCoachId={selectedCoachId}
      selectAthleteParticipant={(id) => { setSelectedAthleteId(id); setSelectedCoachId(""); setDonateError(""); }}
      selectCoachParticipant={(id) => { setSelectedCoachId(id); setSelectedAthleteId(""); setDonateError(""); }}
      participantFilter={participantFilter}
      setParticipantFilter={setParticipantFilter}
      recentDonations={SAMPLE_DONATIONS}
      communityPartners={SAMPLE_PREVIEW_PARTNERS}
      missionItems={SAMPLE_FUND_USES}
      showLeaderboard
      showFundUses
      showRecentDonations
      showDonationCard
      selectedAmount={selectedAmount}
      setSelectedAmount={setSelectedAmount}
      customAmount={customAmount}
      setCustomAmount={setCustomAmount}
      donorName={donorName}
      setDonorName={setDonorName}
      selectedAthleteId={selectedAthleteId}
      donationMessage={donationMessage}
      setDonationMessage={setDonationMessage}
      donating={false}
      donateError={donateError}
      donateLabel={donateLabel}
      handleDonate={() => setDonateError(PREVIEW_DONATE_MESSAGE)}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      leaderboardExpanded={leaderboardExpanded}
      setLeaderboardExpanded={setLeaderboardExpanded}
      donationsExpanded={donationsExpanded}
      setDonationsExpanded={setDonationsExpanded}
      hasMoreDonations={SAMPLE_DONATIONS.length > 5}
      spotlight={view === "athlete" ? { id: me.id, name: me.name, classYear: me.class_year } : null}
      athletePhotoSrcFor={samplePortraitFor}
      avatarSrcFor={sampleAvatarFor}
    />
  );
}
