"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import "../paradise-valley-track-field-live/campaign-live.css";

const FALLBACK_GOAL      = 25000;
const FALLBACK_DAYS_LEFT = 23;

const FALLBACK_ATHLETES = [
  { rank: 1, name: "Marcus Johnson",  event: "Sprints",  raised: 2340 },
  { rank: 2, name: "Aaliyah Rivera",  event: "Distance", raised: 1980 },
  { rank: 3, name: "Tyler Chen",      event: "Jumps",    raised: 1620 },
  { rank: 4, name: "Sofia Martinez",  event: "Throws",   raised: 1410 },
  { rank: 5, name: "Devon Williams",  event: "Hurdles",  raised: 1200 },
];

const initialDonations = [
  { name: "Robert T.",       amount: 100, message: "Go team! Proud to support this program!",  time: "2 hours ago" },
  { name: "Sarah K.",        amount: 50,  message: "Best of luck this season!",                time: "4 hours ago" },
  { name: "Anonymous",       amount: 250, message: "Keep running strong!",                     time: "6 hours ago" },
  { name: "Mike & Janet L.", amount: 75,  message: "Our daughter loves this team!",            time: "1 day ago"   },
  { name: "Coach R.",        amount: 25,  message: "Proud of this program!",                   time: "1 day ago"   },
];

const FALLBACK_GOLD_SPONSORS   = [{ name: "Local Business",    url: "https://example.com" }];
const FALLBACK_SILVER_SPONSORS = [{ name: "Community Partner", url: "https://example.com" }];
const FALLBACK_BRONZE_SPONSORS = [{ name: "Area Sponsor",      url: "https://example.com" }];

const missionItems = [
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
  const [selectedAmount,  setSelectedAmount]  = useState("$50");
  const [customAmount,    setCustomAmount]    = useState("");
  const [donorName,       setDonorName]       = useState("");
  const [selectedAthlete, setSelectedAthlete] = useState("");
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
  const [athletes,        setAthletes]        = useState(FALLBACK_ATHLETES);
  const [recentDonations, setRecentDonations] = useState(initialDonations);
  const [goldSponsors,    setGoldSponsors]    = useState(FALLBACK_GOLD_SPONSORS);
  const [silverSponsors,  setSilverSponsors]  = useState(FALLBACK_SILVER_SPONSORS);
  const [bronzeSponsors,  setBronzeSponsors]  = useState(FALLBACK_BRONZE_SPONSORS);
  const [schoolName,      setSchoolName]      = useState("School Name");
  const [sportName,       setSportName]       = useState("Athletics");
  const [mascot,          setMascot]          = useState("Team");
  const [primaryColor,    setPrimaryColor]    = useState("#1B4FA8");
  const [secondaryColor,  setSecondaryColor]  = useState("#C4A35A");
  const [location,        setLocation]        = useState("");
  const [season,          setSeason]          = useState("2025 Season");
  const [logoUrl,         setLogoUrl]         = useState("/ELF.LOGO.png");

  useEffect(() => {
    fetch(`/api/campaign-stats/${slug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || typeof data.raised !== "number") return;
        const {
          raised: r, donors: d, athleteTotals, recentDonations: rd,
          goal: g, daysLeft: dl, athletes: fetchedAthletes, sponsors: fetchedSponsors,
          school_name: fetchedSchoolName, sport_name: fetchedSportName,
          mascot: fetchedMascot,
          primary_color: fetchedPrimary, secondary_color: fetchedSecondary,
          location: fetchedLocation, season: fetchedSeason,
          logo_url: fetchedLogoUrl,
        } = data;
        setRaised(r);
        setDonors(d);
        if (typeof g === "number") setGoal(g);
        if (typeof dl === "number") setDaysLeft(dl);
        if (typeof fetchedSchoolName === "string" && fetchedSchoolName) setSchoolName(fetchedSchoolName);
        if (typeof fetchedSportName  === "string" && fetchedSportName)  setSportName(fetchedSportName);
        if (typeof fetchedMascot     === "string" && fetchedMascot)     setMascot(fetchedMascot);
        if (typeof fetchedPrimary    === "string" && fetchedPrimary)    setPrimaryColor(fetchedPrimary);
        if (typeof fetchedSecondary  === "string" && fetchedSecondary)  setSecondaryColor(fetchedSecondary);
        if (typeof fetchedLocation   === "string" && fetchedLocation)   setLocation(fetchedLocation);
        if (typeof fetchedSeason     === "string" && fetchedSeason)     setSeason(fetchedSeason);
        if (typeof fetchedLogoUrl    === "string" && fetchedLogoUrl)    setLogoUrl(fetchedLogoUrl);
        const base: { name: string; event: string }[] =
          Array.isArray(fetchedAthletes) && fetchedAthletes.length > 0
            ? fetchedAthletes
            : FALLBACK_ATHLETES;
        setAthletes(
          base
            .map((a) => ({ name: a.name, event: a.event, raised: (athleteTotals[a.name] ?? 0) as number, rank: 0 }))
            .sort((a, b) => b.raised - a.raised)
            .map((a, i) => ({ ...a, rank: i + 1 })),
        );
        if (Array.isArray(rd) && rd.length > 0) setRecentDonations(rd);
        if (Array.isArray(fetchedSponsors)) {
          const byTier = (t: string) =>
            fetchedSponsors
              .filter((s: { tier: string }) => s.tier === t)
              .map((s: { name: string; url: string }) => ({ name: s.name, url: s.url }));
          setGoldSponsors(byTier("gold"));
          setSilverSponsors(byTier("silver"));
          setBronzeSponsors(byTier("bronze"));
        }
      })
      .catch(() => {/* keep fallback data */});
  }, [slug]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--cl-primary",       primaryColor);
    root.style.setProperty("--cl-primary-rgb",   hexToRgb(primaryColor));
    root.style.setProperty("--cl-secondary",     secondaryColor);
    root.style.setProperty("--cl-secondary-rgb", hexToRgb(secondaryColor));
  }, [primaryColor, secondaryColor]);

  const percent = Math.round((raised / goal) * 100);
  const filters = ["Overall", ...Array.from(new Set(athletes.map((a) => a.event)))];

  const displayAmount =
    selectedAmount === "Custom"
      ? customAmount ? `$${customAmount}` : "Custom Amount"
      : selectedAmount;

  const donateLabel =
    selectedAthlete
      ? `Donate ${displayAmount} for ${selectedAthlete} →`
      : `Donate ${displayAmount} to the ${mascot} →`;

  const filteredAthletes = (
    activeFilter === "Overall"
      ? athletes
      : athletes.filter((a) => a.event === activeFilter)
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
          athleteName:     selectedAthlete  || null,
          donorName:       donorName        || null,
          donationMessage: donationMessage  || null,
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

  return (
    <>
      {/* NAV */}
      <nav className="cl-nav">
        <a href="/" className="cl-nav-logo">
          <Image src="/ELF.LOGO.png" alt="Elite Level Fundraising" width={180} height={52} className="cl-nav-logo-img" priority />
          <span className="cl-nav-logo-text">Elite Level Fundraising</span>
        </a>
        <div className="cl-nav-links">
          <a href="#leaderboard" className="cl-nav-link">Leaderboard</a>
          <a href="#donate"      className="cl-nav-link cl-nav-link-cta">Donate</a>
          <a href="#sponsors"    className="cl-nav-link">Sponsors</a>
          <a href="#share"       className="cl-nav-link">Share</a>
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
            <div className="cl-school-season-badge">🐾 {season.toUpperCase()}</div>
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
            <a href="#donate" className="cl-hero-cta">Donate Now →</a>
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
                <div className="cl-img-year">2025 SEASON</div>
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
                      <th>Rank</th><th>Athlete</th><th>Event</th><th>Raised</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAthletes.map((a) => (
                      <tr key={a.rank} className={a.displayRank === 1 ? "cl-row-top" : ""}>
                        <td className="cl-td-rank">{rankIcon(a.displayRank)}</td>
                        <td className="cl-td-name">{a.name}</td>
                        <td className="cl-td-event">{a.event}</td>
                        <td className="cl-td-amount">${a.raised.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="cl-filter-empty">No athletes in this event group yet.</div>
              )}
            </div>

            {/* PROGRAM IDENTITY */}
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
                  <div className="cl-identity-value">🐾 {mascot}</div>
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

            {/* SHARE */}
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

            {/* MISSION */}
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

            {/* RECENT DONATIONS */}
            <div className="cl-card" id="donations">
              <h2 className="cl-card-title">RECENT DONATIONS</h2>
              <p className="cl-card-sub">Join the supporters cheering on the {mascot}</p>
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
            </div>
          </div>

          {/* RIGHT COLUMN — sticky donation card */}
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
                  <select value={selectedAthlete} onChange={(e) => setSelectedAthlete(e.target.value)}>
                    <option value="">— Team General Fund —</option>
                    {athletes.map((a) => (
                      <option key={a.name} value={a.name}>{a.name}</option>
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
        </div>
      </div>

      {/* SPONSORS */}
      <section className="cl-sponsors" id="sponsors">
        <div className="cl-section-inner">
          <p className="section-label">Community Partners</p>
          <h2 className="cl-sponsors-title">OUR LOCAL SPONSORS</h2>
          <p className="cl-sponsors-sub">Businesses investing in our student athletes</p>

          <div className="cl-tier">
            <div className="cl-tier-label cl-tier-gold">🥇 Gold Sponsors</div>
            <div className="cl-tier-logos">
              {goldSponsors.map((s) => (
                <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="cl-sponsor-logo cl-logo-gold">
                  <span className="cl-sponsor-name">{s.name}</span>
                  <span className="cl-sponsor-visit">Visit →</span>
                </a>
              ))}
            </div>
          </div>

          <div className="cl-tier">
            <div className="cl-tier-label cl-tier-silver">🥈 Silver Sponsors</div>
            <div className="cl-tier-logos">
              {silverSponsors.map((s) => (
                <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="cl-sponsor-logo cl-logo-silver">
                  <span className="cl-sponsor-name">{s.name}</span>
                  <span className="cl-sponsor-visit">Visit →</span>
                </a>
              ))}
            </div>
          </div>

          <div className="cl-tier">
            <div className="cl-tier-label cl-tier-bronze">🥉 Bronze Sponsors</div>
            <div className="cl-tier-logos">
              {bronzeSponsors.map((s) => (
                <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="cl-sponsor-logo cl-logo-bronze">
                  <span className="cl-sponsor-name">{s.name}</span>
                  <span className="cl-sponsor-visit">Visit →</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="cl-footer">
        <div className="cl-footer-inner">
          <div className="cl-footer-logo">
            <Image src="/ELF.LOGO.png" alt="Elite Level Fundraising" width={200} height={64} className="cl-footer-logo-img" />
            <span className="cl-footer-logo-text">Elite Level Fundraising</span>
          </div>
          <p className="cl-footer-team">{schoolName} · {sportName} · {season}</p>
          <p className="cl-footer-copy">© 2025 Elite Level Fundraising · All rights reserved</p>
        </div>
      </footer>
    </>
  );
}
