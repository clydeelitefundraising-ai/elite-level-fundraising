"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import "./campaign.css";
import PublicCampaignPage from "./PublicCampaignPage";
import { resolveRecentDonations, resolveLeaderboardAthletes } from "@/lib/campaignPublicDisplay";
import { defaultSeasonLabel } from "@/lib/campaignSeason";
import { currentCopyrightYear } from "@/lib/copyrightYear";
import { ElfMark } from "@/components/BrandMark";

// Mirrors lib/supabase.ts's ATHLETE_CLASS_OPTIONS — kept local (not imported)
// since this is a client component and that module is server-only.
const ATHLETE_CLASS_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior"] as const;

const FALLBACK_GOAL      = 25000;
const FALLBACK_DAYS_LEFT = 23;

// No fabricated athletes or donations here (there used to be — "Marcus
// Johnson", "Robert T.", etc.) — a live campaign with zero real athletes or
// zero real donations must render an honest empty state, never invented
// people/amounts. See the empty-state renders below (cl-filter-empty /
// cl-donations-empty) for what a viewer actually sees in that case.

type SponsorItem = { name: string; url: string; logo_url?: string | null; description?: string | null };

const FALLBACK_MISSION = [
  { icon: "plane",     label: "Travel & Transportation", desc: "Away meets, regional championships, and travel to compete." },
  { icon: "clipboard", label: "Meet Entry Fees",          desc: "Registration costs for conference meets, invitationals, and state qualifiers." },
  { icon: "shoe",      label: "Equipment & Gear",         desc: "Sport-specific equipment and training tools." },
  { icon: "shirt",     label: "Uniforms",                 desc: "Competition uniforms, warm-up suits, and team apparel for all athletes." },
  { icon: "dumbbell",  label: "Recovery Tools",           desc: "Foam rollers, resistance bands, ice packs, and injury prevention equipment." },
  { icon: "utensils",  label: "Team Meals",               desc: "Pre-meet fueling and post-competition meals to keep athletes performing at their best." },
];

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "27, 79, 168";
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export default function CampaignPageClient({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const [selectedAmount,  setSelectedAmount]  = useState("$50");
  const [customAmount,    setCustomAmount]    = useState("");
  const [donorName,         setDonorName]         = useState("");
  // Canonical athlete id (Phase 3A-1 share-path fix) — the <select> below is
  // keyed by id, not name, so attribution is exact even when two athletes
  // share a name. Display name is derived from `athletes` (the very list
  // the id came from), never re-guessed from free text.
  const [selectedAthleteId, setSelectedAthleteId] = useState("");
  const [donationMessage, setDonationMessage] = useState("");
  const [donating,        setDonating]        = useState(false);
  const [donateError,     setDonateError]     = useState("");

  const [activeFilter, setActiveFilter] = useState("Overall");
  const [searchQuery,  setSearchQuery]  = useState("");
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false);
  const [donationsExpanded,   setDonationsExpanded]   = useState(false);

  const [raised,          setRaised]          = useState(0);
  const [donors,          setDonors]          = useState(0);
  const [goal,            setGoal]            = useState(FALLBACK_GOAL);
  const [daysLeft,        setDaysLeft]        = useState(FALLBACK_DAYS_LEFT);
  const [athletes,        setAthletes]        = useState<{ id: string; rank: number; name: string; event: string | null; class_year: string | null; raised: number }[]>([]);
  const [recentDonations, setRecentDonations] = useState<{ name: string; amount: number; message: string; time: string }[]>([]);
  const [titleSponsors,     setTitleSponsors]     = useState<SponsorItem[]>([]);
  const [platinumSponsors,  setPlatinumSponsors]  = useState<SponsorItem[]>([]);
  const [goldSponsors,      setGoldSponsors]      = useState<SponsorItem[]>([]);
  const [silverSponsors,    setSilverSponsors]    = useState<SponsorItem[]>([]);
  const [bronzeSponsors,    setBronzeSponsors]    = useState<SponsorItem[]>([]);
  const [communitySponsors, setCommunitySponsors] = useState<SponsorItem[]>([]);
  const [schoolName,      setSchoolName]      = useState("School Name");
  const [sportName,       setSportName]       = useState("Athletics");
  const [mascot,          setMascot]          = useState("Team");
  // Campaign (page theme) colors — independent of team colors, drive the
  // fundraising page's look (hero, buttons, accents, progress bar, etc.).
  // Default to the same values as team colors so a campaign with no theme
  // configured yet renders identically to before this feature existed.
  const [themePrimaryColor,   setThemePrimaryColor]   = useState("#1B4FA8");
  const [themeSecondaryColor, setThemeSecondaryColor] = useState("#C4A35A");
  const [themeAccentColor,    setThemeAccentColor]    = useState("#C4A35A");
  const [themeButtonColor,    setThemeButtonColor]    = useState("#1B4FA8");
  const [location,        setLocation]        = useState("");
  const [season,          setSeason]          = useState(defaultSeasonLabel);
  // Empty until the team's own settings.logo_url loads — falls back to
  // ElfMark (the ELF platform mark) at each render site below rather than
  // showing the old desert-logo placeholder for a team with no logo yet.
  const [logoUrl,         setLogoUrl]         = useState("");
  const [description,     setDescription]     = useState("");
  const [archived,        setArchived]        = useState(false);
  const [missionItems,    setMissionItems]    = useState(FALLBACK_MISSION);

  const [showLeaderboard,     setShowLeaderboard]     = useState(true);
  const [showFundUses,        setShowFundUses]        = useState(true);
  const [showRecentDonations, setShowRecentDonations] = useState(true);
  const [showSponsors,        setShowSponsors]        = useState(true);
  const [showDonationCard,    setShowDonationCard]    = useState(true);

  useEffect(() => {
    fetch(`/api/campaign-stats/${slug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || typeof data.raised !== "number") return;
        const {
          raised: r, donors: d, athleteTotals, recentDonations: rd,
          goal: g, displayGoal: dg, daysLeft: dl, athletes: fetchedAthletes, sponsors: fetchedSponsors,
          school_name: fetchedSchoolName, sport_name: fetchedSportName,
          mascot: fetchedMascot,
          theme_primary_color: fetchedThemePrimary, theme_secondary_color: fetchedThemeSecondary,
          theme_accent_color: fetchedThemeAccent, theme_button_color: fetchedThemeButton,
          location: fetchedLocation, season: fetchedSeason,
          logo_url: fetchedLogoUrl,
          description: fetchedDescription,
          archived: fetchedArchived,
        } = data;
        setArchived(fetchedArchived === true);
        setShowLeaderboard(    data.show_leaderboard      !== false);
        setShowFundUses(       data.show_fund_uses        !== false);
        setShowRecentDonations(data.show_recent_donations !== false);
        setShowSponsors(       data.show_sponsors         !== false);
        setShowDonationCard(   data.show_donation_card    !== false);
        setRaised(r);
        setDonors(d);
        // Phase 3D: this page is entirely public/fundraising-facing, so its
        // one `goal` state drives every displayed number (hero stat,
        // progress bar, "still needed") — sourcing it from the dynamic
        // displayGoal keeps all of them consistent with each other. Falls
        // back to the base goal if displayGoal wasn't computed (e.g. no
        // campaign_settings row yet), matching pre-3D behavior exactly.
        if (typeof dg === "number") setGoal(dg);
        else if (typeof g === "number") setGoal(g);
        if (typeof dl === "number") setDaysLeft(dl);
        if (typeof fetchedSchoolName === "string" && fetchedSchoolName) setSchoolName(fetchedSchoolName);
        if (typeof fetchedSportName  === "string" && fetchedSportName)  setSportName(fetchedSportName);
        if (typeof fetchedMascot     === "string" && fetchedMascot)     setMascot(fetchedMascot);
        if (typeof fetchedThemePrimary   === "string" && fetchedThemePrimary)   setThemePrimaryColor(fetchedThemePrimary);
        if (typeof fetchedThemeSecondary === "string" && fetchedThemeSecondary) setThemeSecondaryColor(fetchedThemeSecondary);
        if (typeof fetchedThemeAccent    === "string" && fetchedThemeAccent)    setThemeAccentColor(fetchedThemeAccent);
        if (typeof fetchedThemeButton    === "string" && fetchedThemeButton)    setThemeButtonColor(fetchedThemeButton);
        if (typeof fetchedLocation   === "string" && fetchedLocation)   setLocation(fetchedLocation);
        if (typeof fetchedSeason     === "string" && fetchedSeason)     setSeason(fetchedSeason);
        if (typeof fetchedLogoUrl    === "string" && fetchedLogoUrl)    setLogoUrl(fetchedLogoUrl);
        if (typeof fetchedDescription === "string" && fetchedDescription) setDescription(fetchedDescription);
        // Real roster only — an empty roster renders the honest "no
        // athletes yet" empty state below, never invented names.
        const base = resolveLeaderboardAthletes(fetchedAthletes);
        setAthletes(
          base
            .map((a) => ({ id: a.id, name: a.name, event: a.event, class_year: a.class_year ?? null, raised: (athleteTotals[a.name] ?? 0) as number, rank: 0 }))
            .sort((a, b) => b.raised - a.raised)
            .map((a, i) => ({ ...a, rank: i + 1 })),
        );
        // Always sync to the real value, including an empty array — a
        // zero-donation campaign must show zero donations, not linger on
        // whatever recentDonations already held.
        setRecentDonations(resolveRecentDonations(rd));
        if (Array.isArray(data.fund_uses) && data.fund_uses.length > 0) {
          setMissionItems(data.fund_uses.map((f: { icon: string; title: string; description: string }) => ({ icon: f.icon, label: f.title, desc: f.description })));
        }
        if (Array.isArray(fetchedSponsors)) {
          const byTier = (t: string): SponsorItem[] =>
            fetchedSponsors
              .filter((s: { tier: string }) => s.tier === t)
              .map((s: { name: string; url: string; logo_url?: string | null; description?: string | null }) => ({
                name: s.name, url: s.url, logo_url: s.logo_url ?? null, description: s.description ?? null,
              }));
          setTitleSponsors(byTier("title"));
          setPlatinumSponsors(byTier("platinum"));
          setGoldSponsors(byTier("gold"));
          setSilverSponsors(byTier("silver"));
          setBronzeSponsors(byTier("bronze"));
          setCommunitySponsors(byTier("community_partner"));
        }
      })
      .catch(() => {/* keep fallback data */});
  }, [slug]);

  // Shared-athlete-link prefill (Phase 3A-1 share-path fix): ?athlete=<id>
  // preselects that athlete in the donate form once the real, campaign-
  // scoped athlete list has loaded. Only ever matches against `athletes`
  // (the fresh fetch result for THIS campaign) — a stale/tampered/
  // cross-campaign id in the URL simply never matches and the form quietly
  // falls back to the general fund, exactly like no param was supplied.
  // /api/checkout re-validates independently regardless.
  useEffect(() => {
    const athleteParam = searchParams.get("athlete");
    if (athleteParam && athletes.some((a) => a.id === athleteParam)) {
      // Syncing local selection state to an external source (the URL) once
      // the campaign-scoped athlete list is available — the correct use of
      // an effect here, not a derived-during-render value.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedAthleteId(athleteParam);
    }
  }, [athletes, searchParams]);

  // Page chrome (hero, buttons, accents, progress bar, headings, cards) is
  // driven entirely by the CAMPAIGN theme colors, not the team colors —
  // that's the whole point of separating them.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--cl-primary",       themePrimaryColor);
    root.style.setProperty("--cl-primary-rgb",   hexToRgb(themePrimaryColor));
    root.style.setProperty("--cl-secondary",     themeSecondaryColor);
    root.style.setProperty("--cl-secondary-rgb", hexToRgb(themeSecondaryColor));
    root.style.setProperty("--cl-accent",        themeAccentColor);
    root.style.setProperty("--cl-accent-rgb",    hexToRgb(themeAccentColor));
    root.style.setProperty("--cl-button",        themeButtonColor);
    root.style.setProperty("--cl-button-rgb",    hexToRgb(themeButtonColor));
  }, [themePrimaryColor, themeSecondaryColor, themeAccentColor, themeButtonColor]);

  const percent = Math.round((raised / goal) * 100);
  const filters = ["Overall", ...ATHLETE_CLASS_OPTIONS];

  const displayAmount =
    selectedAmount === "Custom"
      ? customAmount ? `$${customAmount}` : "Custom Amount"
      : selectedAmount;

  // Display name is looked up from the current campaign's own athlete list
  // by exact id match — never guessed/matched from free text.
  const selectedAthleteName = athletes.find((a) => a.id === selectedAthleteId)?.name ?? "";

  const donateLabel =
    selectedAthleteId
      ? `Donate ${displayAmount} for ${selectedAthleteName || "this athlete"} →`
      : `Donate ${displayAmount} to the ${mascot} →`;

  const filteredAthletes = (
    activeFilter === "Overall"
      ? athletes
      : athletes.filter((a) => a.class_year === activeFilter)
  ).map((a, i) => ({ ...a, displayRank: i + 1 }));

  const handleDonate = async () => {
    setDonateError("");
    const raw = selectedAmount === "Custom" ? customAmount : selectedAmount.replace("$", "");
    const parsed = parseFloat(raw);
    if (!parsed || parsed < 1) {
      setDonateError("Please enter a valid donation amount.");
      return;
    }
    setDonating(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents:     Math.round(parsed * 100),
          athleteId:       selectedAthleteId   || null,
          athleteName:     selectedAthleteName || null,
          donorName:       donorName           || null,
          donationMessage: donationMessage     || null,
          campaignSlug:    slug,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setDonateError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setDonateError("Network error. Please try again.");
    } finally {
      setDonating(false);
    }
  };

  const hasMoreDonations = recentDonations.length > 5;

  const sharedProps = {
    slug,
    schoolName, sportName, mascot,
    themePrimaryColor, location, season, logoUrl, description,
    raised, donors, goal, daysLeft, percent,
    athletes, filteredAthletes, filters, activeFilter, setActiveFilter,
    recentDonations,
    titleSponsors, platinumSponsors, goldSponsors, silverSponsors, bronzeSponsors, communitySponsors,
    missionItems,
    showLeaderboard,
    showFundUses, showRecentDonations, showSponsors, showDonationCard,
    selectedAmount, setSelectedAmount, customAmount, setCustomAmount,
    donorName, setDonorName, selectedAthleteId, setSelectedAthleteId,
    donationMessage, setDonationMessage,
    donating, donateError, donateLabel, handleDonate,
    searchQuery, setSearchQuery, leaderboardExpanded, setLeaderboardExpanded,
    donationsExpanded, setDonationsExpanded, hasMoreDonations,
  };


  if (archived) {
    return (
      <div className="pc-page">
        <nav className="pc-nav">
          <div className="pc-nav-inner">
            <a href="/" className="pc-nav-brand">
              <ElfMark size={32} />
            </a>
          </div>
        </nav>
        <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", maxWidth: 480, padding: "2rem" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#12151c", margin: "0 0 .75rem" }}>This fundraising campaign has ended.</h1>
            <p style={{ color: "#6b7280", fontSize: "1rem", margin: 0 }}>Thank you to everyone who supported {schoolName} {sportName}.</p>
          </div>
        </div>
        <footer className="pc-footer">
          <div className="pc-footer-inner">
            <p className="pc-footer-team">{schoolName} · {sportName} · {season}</p>
            <div className="pc-footer-powered">
              <ElfMark size={20} />
              <span>Powered by Elite Level Fundraising · © {currentCopyrightYear()}</span>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return <PublicCampaignPage {...sharedProps} />;
}
