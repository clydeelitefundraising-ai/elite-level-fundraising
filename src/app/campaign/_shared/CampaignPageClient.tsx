"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import "./campaign.css";
import PremiumLayout from "./PremiumLayout";
import { resolveRecentDonations, resolveLeaderboardAthletes } from "@/lib/campaignPublicDisplay";
import { defaultSeasonLabel } from "@/lib/campaignSeason";
import { currentCopyrightYear } from "@/lib/copyrightYear";

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
  { icon: "✈️", label: "Travel & Transportation", desc: "Away meets, regional championships, and travel to compete." },
  { icon: "📋", label: "Meet Entry Fees",          desc: "Registration costs for conference meets, invitationals, and state qualifiers." },
  { icon: "👟", label: "Equipment & Gear",         desc: "Sport-specific equipment and training tools." },
  { icon: "👕", label: "Uniforms",                 desc: "Competition uniforms, warm-up suits, and team apparel for all athletes." },
  { icon: "💪", label: "Recovery Tools",           desc: "Foam rollers, resistance bands, ice packs, and injury prevention equipment." },
  { icon: "🍱", label: "Team Meals",               desc: "Pre-meet fueling and post-competition meals to keep athletes performing at their best." },
];

const rankIcon = (r: number) =>
  r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : `#${r}`;

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
  const [copyConfirm,  setCopyConfirm]  = useState(false);
  const [shareNote,    setShareNote]    = useState("");

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
  // Team colors — actual school/team branding. Used ONLY for team identity
  // elements (Program Identity swatches). Never drives page theme/chrome.
  const [primaryColor,    setPrimaryColor]    = useState("#1B4FA8");
  const [secondaryColor,  setSecondaryColor]  = useState("#C4A35A");
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
  const [logoUrl,         setLogoUrl]         = useState("/ELF.LOGO.png");
  const [archived,        setArchived]        = useState(false);
  const [missionItems,    setMissionItems]    = useState(FALLBACK_MISSION);

  const [showLeaderboard,     setShowLeaderboard]     = useState(true);
  const [showProgramIdentity, setShowProgramIdentity] = useState(true);
  const [showShareSection,    setShowShareSection]    = useState(true);
  const [showFundUses,        setShowFundUses]        = useState(true);
  const [showRecentDonations, setShowRecentDonations] = useState(true);
  const [showSponsors,        setShowSponsors]        = useState(true);
  const [showDonationCard,    setShowDonationCard]    = useState(true);
  const [layoutVariant,       setLayoutVariant]       = useState<"classic" | "premium">("classic");

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
          primary_color: fetchedPrimary, secondary_color: fetchedSecondary,
          theme_primary_color: fetchedThemePrimary, theme_secondary_color: fetchedThemeSecondary,
          theme_accent_color: fetchedThemeAccent, theme_button_color: fetchedThemeButton,
          location: fetchedLocation, season: fetchedSeason,
          logo_url: fetchedLogoUrl,
          archived: fetchedArchived,
        } = data;
        setArchived(fetchedArchived === true);
        setShowLeaderboard(    data.show_leaderboard      !== false);
        setShowProgramIdentity(data.show_program_identity !== false);
        setShowShareSection(   data.show_share_section    !== false);
        setShowFundUses(       data.show_fund_uses        !== false);
        setShowRecentDonations(data.show_recent_donations !== false);
        setShowSponsors(       data.show_sponsors         !== false);
        setShowDonationCard(   data.show_donation_card    !== false);
        if (data.layout_variant === "premium") setLayoutVariant("premium");
        else setLayoutVariant("classic");
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
        if (typeof fetchedPrimary    === "string" && fetchedPrimary)    setPrimaryColor(fetchedPrimary);
        if (typeof fetchedSecondary  === "string" && fetchedSecondary)  setSecondaryColor(fetchedSecondary);
        if (typeof fetchedThemePrimary   === "string" && fetchedThemePrimary)   setThemePrimaryColor(fetchedThemePrimary);
        if (typeof fetchedThemeSecondary === "string" && fetchedThemeSecondary) setThemeSecondaryColor(fetchedThemeSecondary);
        if (typeof fetchedThemeAccent    === "string" && fetchedThemeAccent)    setThemeAccentColor(fetchedThemeAccent);
        if (typeof fetchedThemeButton    === "string" && fetchedThemeButton)    setThemeButtonColor(fetchedThemeButton);
        if (typeof fetchedLocation   === "string" && fetchedLocation)   setLocation(fetchedLocation);
        if (typeof fetchedSeason     === "string" && fetchedSeason)     setSeason(fetchedSeason);
        if (typeof fetchedLogoUrl    === "string" && fetchedLogoUrl)    setLogoUrl(fetchedLogoUrl);
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

  const handleCopyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); } catch { /* blocked */ }
    setCopyConfirm(true);
    setTimeout(() => setCopyConfirm(false), 2500);
  };

  const handleText = () => {
    const body = encodeURIComponent(`Support ${schoolName} ${sportName}! ${window.location.href}`);
    window.open(`sms:?body=${body}`);
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Support ${schoolName} ${sportName}`);
    const body    = encodeURIComponent(`I wanted to share this fundraiser with you:\n\n${window.location.href}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const handleSocial = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `Support ${schoolName} ${sportName}`, text: `Help the ${schoolName} team compete this season!`, url: window.location.href });
        return;
      } catch { /* cancelled or unavailable */ }
    }
    setShareNote("Copy the URL above to share on social media.");
    setTimeout(() => setShareNote(""), 3000);
  };

  const sharedProps = {
    slug,
    schoolName,   sportName, mascot,
    teamPrimaryColor: primaryColor, teamSecondaryColor: secondaryColor,
    themePrimaryColor, themeSecondaryColor, themeAccentColor, themeButtonColor,
    location,     season,    logoUrl,
    raised,       donors,    goal,   daysLeft,     percent,
    athletes,     filteredAthletes,  filters,      activeFilter, setActiveFilter,
    recentDonations,
    titleSponsors, platinumSponsors, goldSponsors, silverSponsors, bronzeSponsors, communitySponsors,
    missionItems,
    showLeaderboard, showProgramIdentity, showShareSection,
    showFundUses,    showRecentDonations, showSponsors, showDonationCard,
    selectedAmount, setSelectedAmount, customAmount, setCustomAmount,
    donorName,    setDonorName, selectedAthleteId, setSelectedAthleteId,
    donationMessage, setDonationMessage,
    donating, donateError, donateLabel, handleDonate,
    copyConfirm, shareNote, handleCopyLink, handleText, handleEmail, handleSocial,
  };

  if (layoutVariant === "premium" && !archived) {
    return <PremiumLayout {...sharedProps} />;
  }

  if (archived) {
    return (
      <>
        <nav className="cl-nav">
          <a href="/" className="cl-nav-logo">
            <Image src="/ELF.LOGO.png" alt="Elite Level Fundraising" width={180} height={52} className="cl-nav-logo-img" priority />
            <span className="cl-nav-logo-text">Elite Level Fundraising</span>
          </a>
        </nav>
        <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ textAlign: "center", maxWidth: 480, padding: "2rem" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏁</div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d", margin: "0 0 .75rem" }}>This fundraising campaign has ended.</h1>
            <p style={{ color: "#6b7280", fontSize: "1rem", margin: 0 }}>Thank you to everyone who supported {schoolName} {sportName}.</p>
          </div>
        </div>
        <footer className="cl-footer">
          <div className="cl-footer-inner">
            <div className="cl-footer-logo">
              <Image src="/ELF.LOGO.png" alt="Elite Level Fundraising" width={200} height={64} className="cl-footer-logo-img" />
              <span className="cl-footer-logo-text">Elite Level Fundraising</span>
            </div>
            <p className="cl-footer-team">{schoolName} · {sportName} · {season}</p>
            <p className="cl-footer-copy">© {currentCopyrightYear()} Elite Level Fundraising · All rights reserved</p>
          </div>
        </footer>
      </>
    );
  }

  return (
    <>
      {/* NAV */}
      <nav className="cl-nav">
        <a href="/" className="cl-nav-logo">
          <Image src="/ELF.LOGO.png" alt="Elite Level Fundraising" width={180} height={52} className="cl-nav-logo-img" priority />
          <span className="cl-nav-logo-text">Elite Level Fundraising</span>
        </a>
        <div className="cl-nav-links">
          {showLeaderboard  && <a href="#leaderboard" className="cl-nav-link">Leaderboard</a>}
          {showDonationCard && <a href="#donate"      className="cl-nav-link cl-nav-link-cta">Donate</a>}
          {showSponsors     && <a href="#sponsors"    className="cl-nav-link">Sponsors</a>}
          {showShareSection && <a href="#share"       className="cl-nav-link">Share</a>}
        </div>
        <span className="cl-live-badge">● LIVE CAMPAIGN</span>
      </nav>

      {/* HERO */}
      <header className="cl-hero">
        <div className="cl-school-header">
          <div className="cl-school-header-inner">
            <div className="cl-header-logo-wrap">
              <img src={logoUrl} alt={schoolName} />
            </div>
            <div className="cl-school-info">
              <div className="cl-school-name">{schoolName.toUpperCase()} {mascot.toUpperCase()}</div>
              <div className="cl-school-meta">
                {sportName} &nbsp;·&nbsp; {location} &nbsp;·&nbsp; {season}
              </div>
            </div>
          </div>
        </div>

        <div className="cl-hero-inner">
          <div className="cl-hero-text">
            <div className="cl-badge">🏃 {sportName} · {location}</div>
            <h1>
              {schoolName.toUpperCase()}<br />
              <em>{sportName.toUpperCase()}</em>
            </h1>
            <p className="cl-hero-sub">
              Support the {schoolName} {sportName} program as they prepare for another competitive season.
            </p>
            <div className="cl-hero-stats">
              <div className="cl-hero-stat">
                <strong>${raised.toLocaleString()}</strong>
                <span>raised of ${goal.toLocaleString()}</span>
              </div>
              <div className="cl-stat-divider" />
              <div className="cl-hero-stat">
                <strong>{donors}</strong>
                <span>donors</span>
              </div>
              <div className="cl-stat-divider" />
              <div className="cl-hero-stat">
                <strong>{daysLeft}</strong>
                <span>days left</span>
              </div>
            </div>
            {showDonationCard && <a href="#donate" className="cl-hero-cta">Donate Now →</a>}
          </div>

          <div className="cl-hero-visual">
            <div className="cl-img-placeholder">
              <div className="cl-img-accent" />
              <div className="cl-img-content">
                <div className="cl-logo-small">
                  <img src={logoUrl} alt={schoolName} />
                </div>
                <div className="cl-img-school-name">{schoolName.toUpperCase()}</div>
                <div className="cl-img-mascot-name">{mascot.toUpperCase()}</div>
                <div className="cl-img-divider" />
                <div className="cl-img-sport">{sportName.toUpperCase()}</div>
                <div className="cl-img-year">{season.toUpperCase()}</div>
              </div>
              <div className="cl-img-grass-bar" />
            </div>
          </div>
        </div>
      </header>

      {/* PROGRESS STRIP */}
      <div className="cl-progress-strip">
        <div className="cl-section-inner">
          <div className="cl-progress-labels">
            <span className="cl-progress-raised">${raised.toLocaleString()} raised</span>
            <span className="cl-progress-pct">{percent}% of ${goal.toLocaleString()} goal</span>
          </div>
          <div className="cl-progress-track">
            <div className="cl-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="cl-progress-meta">
            <span>{donors} donors</span>
            <span>·</span>
            <span>{daysLeft} days remaining</span>
            <span>·</span>
            <span>${(goal - raised).toLocaleString()} still needed</span>
          </div>
        </div>
      </div>

      {/* MAIN TWO-COLUMN */}
      <div className="cl-main">
        <div className="cl-main-inner">

          {/* LEFT COLUMN */}
          <div className="cl-left">

            {/* LEADERBOARD */}
            {showLeaderboard && (
              <div className="cl-card" id="leaderboard">
                <h2 className="cl-card-title">ATHLETE LEADERBOARD</h2>
                <p className="cl-card-sub">Top fundraisers on the team this season</p>
                <div className="cl-filter-tabs">
                  {filters.map((f) => (
                    <button key={f} className={`cl-filter-tab${activeFilter === f ? " active" : ""}`} onClick={() => setActiveFilter(f)}>
                      {f}
                    </button>
                  ))}
                </div>
                {filteredAthletes.length > 0 ? (
                  <table className="cl-table">
                    <thead>
                      <tr>
                        <th>Rank</th><th>Athlete</th><th>Class</th><th>Raised</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAthletes.map((a) => (
                        <tr key={a.rank} className={a.displayRank === 1 ? "cl-row-top" : ""}>
                          <td className="cl-td-rank">{rankIcon(a.displayRank)}</td>
                          <td className="cl-td-name">{a.name}</td>
                          <td className="cl-td-event">{a.class_year ?? "—"}</td>
                          <td className="cl-td-amount">${a.raised.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="cl-filter-empty">No athletes in this class group yet.</div>
                )}
              </div>
            )}

            {/* PROGRAM IDENTITY */}
            {showProgramIdentity && (
              <div className="cl-card cl-identity-card">
                <div className="cl-identity-header">
                  <div className="cl-identity-logo-wrap">
                    <img src={logoUrl} alt={schoolName} />
                  </div>
                  <div className="cl-identity-header-text">
                    <h2 className="cl-card-title">PROGRAM IDENTITY</h2>
                    <p className="cl-card-sub">{schoolName} Athletics</p>
                  </div>
                </div>
                <div className="cl-identity-grid">
                  <div className="cl-identity-item">
                    <div className="cl-identity-label">Mascot</div>
                    <div className="cl-identity-value">{mascot}</div>
                  </div>
                  <div className="cl-identity-item">
                    <div className="cl-identity-label">Colors</div>
                    <div className="cl-identity-value cl-identity-colors">
                      <span className="cl-color-swatch" style={{ background: primaryColor }} />
                      <span className="cl-color-swatch" style={{ background: secondaryColor }} />
                    </div>
                  </div>
                  <div className="cl-identity-item">
                    <div className="cl-identity-label">Program</div>
                    <div className="cl-identity-value">{sportName}</div>
                  </div>
                  <div className="cl-identity-item">
                    <div className="cl-identity-label">School</div>
                    <div className="cl-identity-value">{schoolName}</div>
                  </div>
                </div>
              </div>
            )}

            {/* SHARE */}
            {showShareSection && (
              <div className="cl-card" id="share">
                <h2 className="cl-card-title">SHARE THIS CAMPAIGN</h2>
                <p className="cl-card-sub">Help us reach our goal — every share brings us closer</p>
                <div className="cl-share-grid">
                  <button className={`cl-share-btn${copyConfirm ? " copied" : ""}`} onClick={handleCopyLink}>
                    <span className="cl-share-icon">🔗</span>
                    {copyConfirm ? "Copied!" : "Copy Link"}
                  </button>
                  <button className="cl-share-btn" onClick={handleText}>
                    <span className="cl-share-icon">💬</span> Text
                  </button>
                  <button className="cl-share-btn" onClick={handleEmail}>
                    <span className="cl-share-icon">✉️</span> Email
                  </button>
                  <button className="cl-share-btn" onClick={handleSocial}>
                    <span className="cl-share-icon">📲</span> Social
                  </button>
                </div>
                {copyConfirm && <p className="cl-share-confirm">✓ Campaign link copied to clipboard!</p>}
                {shareNote   && <p className="cl-share-confirm">{shareNote}</p>}
              </div>
            )}

            {/* MISSION */}
            {showFundUses && (
              <div className="cl-card" id="mission">
                <h2 className="cl-card-title">WHERE YOUR MONEY GOES</h2>
                <p className="cl-card-sub">Every dollar raised supports student athletes directly</p>
                <div className="cl-mission-grid">
                  {missionItems.map((item) => (
                    <div className="cl-mission-item" key={item.label}>
                      <div className="cl-mission-icon">{item.icon}</div>
                      <div>
                        <h4>{item.label}</h4>
                        <p>{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* RECENT DONATIONS */}
            {showRecentDonations && (
              <div className="cl-card" id="donations">
                <h2 className="cl-card-title">RECENT DONATIONS</h2>
                <p className="cl-card-sub">Join the supporters cheering on the {mascot}</p>
                {recentDonations.length > 0 ? (
                  <div className="cl-donations-list">
                    {recentDonations.map((d, i) => (
                      <div className="cl-donation-item" key={i}>
                        <div className="cl-avatar">{d.name[0]}</div>
                        <div className="cl-donation-body">
                          <div className="cl-donation-top">
                            <span className="cl-donation-name">{d.name}</span>
                            <span className="cl-donation-amount">${d.amount}</span>
                          </div>
                          {d.message && <p className="cl-donation-msg">&ldquo;{d.message}&rdquo;</p>}
                          <span className="cl-donation-time">{d.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="cl-filter-empty">No donations yet. Be the first to support this program.</div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN — sticky donation card */}
          {showDonationCard && (
            <div className="cl-right">
              <div className="cl-donate-card" id="donate">
                <div className="cl-donate-header">
                  <h2>DONATE TO THE {mascot.toUpperCase()}</h2>
                  <p>Support {schoolName} {sportName}</p>
                </div>
                <div className="cl-donate-body">
                  <p className="cl-field-label">Choose an amount</p>
                  <div className="cl-amounts">
                    {(["$25", "$50", "$100", "$250", "Custom"] as const).map((amt) => (
                      <button
                        key={amt}
                        className={`cl-amount-btn${selectedAmount === amt ? " active" : ""}`}
                        onClick={() => setSelectedAmount(amt)}
                      >
                        {amt}
                      </button>
                    ))}
                  </div>

                  {selectedAmount === "Custom" && (
                    <div className="cl-form-field cl-custom-amount-field">
                      <label>Enter amount ($)</label>
                      <input type="number" min="1" placeholder="Enter amount" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} />
                    </div>
                  )}

                  <div className="cl-form-field">
                    <label>Your Name</label>
                    <input type="text" placeholder="Jane Smith" value={donorName} onChange={(e) => setDonorName(e.target.value)} />
                  </div>

                  <div className="cl-form-field">
                    <label>Support a specific athlete <span className="cl-optional">(optional)</span></label>
                    <select value={selectedAthleteId} onChange={(e) => setSelectedAthleteId(e.target.value)}>
                      <option value="">— Team General Fund —</option>
                      {athletes.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="cl-form-field">
                    <label>Leave a message <span className="cl-optional">(optional)</span></label>
                    <textarea rows={3} placeholder={`Go ${mascot}! We're rooting for you this season.`} value={donationMessage} onChange={(e) => setDonationMessage(e.target.value)} />
                  </div>

                  <button className="cl-donate-btn" onClick={handleDonate} disabled={donating}>
                    {donating ? "Redirecting to Stripe…" : donateLabel}
                  </button>
                  {donateError && <p className="cl-donate-error">{donateError}</p>}
                  <p className="cl-stripe-note">🔒 Secure checkout powered by Stripe</p>
                </div>
              </div>

              <div className="cl-powered-by">
                <Image src="/ELF.LOGO.png" alt="Elite Level Fundraising" width={100} height={28} className="cl-powered-logo-img" />
                <span>Powered by Elite Level Fundraising</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SPONSORS */}
      {showSponsors && (
        <section className="cl-sponsors" id="sponsors">
          <div className="cl-section-inner">
            <p className="section-label">Community Partners</p>
            <h2 className="cl-sponsors-title">OUR LOCAL SPONSORS</h2>
            <p className="cl-sponsors-sub">Businesses investing in our student athletes</p>

            {([
              { key: "title",             items: titleSponsors,     label: "👑 Title Sponsor",      cls: "cl-logo-title"    },
              { key: "platinum",          items: platinumSponsors,  label: "💎 Platinum Sponsors",  cls: "cl-logo-platinum" },
              { key: "gold",              items: goldSponsors,      label: "🥇 Gold Sponsors",      cls: "cl-logo-gold"     },
              { key: "silver",            items: silverSponsors,    label: "🥈 Silver Sponsors",    cls: "cl-logo-silver"   },
              { key: "bronze",            items: bronzeSponsors,    label: "🥉 Bronze Sponsors",    cls: "cl-logo-bronze"   },
              { key: "community_partner", items: communitySponsors, label: "🤝 Community Partners", cls: "cl-logo-community"},
            ] as const).filter(g => g.items.length > 0).map(g => (
              <div key={g.key} className="cl-tier">
                <div className={`cl-tier-label cl-tier-${g.key}`}>{g.label}</div>
                <div className="cl-tier-logos">
                  {g.items.map((s) => (
                    <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className={`cl-sponsor-logo ${g.cls}`}>
                      <div className="cl-sponsor-logo-area">
                        {s.logo_url
                          ? <img src={s.logo_url} alt={s.name} className="cl-sponsor-logo-img" />
                          : <span className="cl-sponsor-logo-fallback">{s.name[0]?.toUpperCase() ?? "S"}</span>
                        }
                      </div>
                      <span className="cl-sponsor-name">{s.name}</span>
                      {s.description && <span className="cl-sponsor-desc">{s.description}</span>}
                      <span className="cl-sponsor-visit">Visit →</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="cl-footer">
        <div className="cl-footer-inner">
          <div className="cl-footer-logo">
            <Image src="/ELF.LOGO.png" alt="Elite Level Fundraising" width={200} height={64} className="cl-footer-logo-img" />
            <span className="cl-footer-logo-text">Elite Level Fundraising</span>
          </div>
          <p className="cl-footer-team">{schoolName} · {sportName} · {season}</p>
          <p className="cl-footer-copy">© {currentCopyrightYear()} Elite Level Fundraising · All rights reserved</p>
        </div>
      </footer>
    </>
  );
}
