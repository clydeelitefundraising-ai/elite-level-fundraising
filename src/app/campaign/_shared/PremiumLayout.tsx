"use client";

import Image from "next/image";
import "./campaign.css";

const rankIcon = (r: number) =>
  r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : `#${r}`;

export type PremiumLayoutProps = {
  slug: string;
  schoolName: string;
  sportName: string;
  mascot: string;
  primaryColor: string;
  secondaryColor: string;
  location: string;
  season: string;
  logoUrl: string;
  raised: number;
  donors: number;
  goal: number;
  daysLeft: number;
  percent: number;
  athletes: { rank: number; name: string; event: string | null; class_year: string | null; raised: number }[];
  filteredAthletes: { rank: number; displayRank: number; name: string; event: string | null; class_year: string | null; raised: number }[];
  filters: string[];
  activeFilter: string;
  setActiveFilter: (v: string) => void;
  recentDonations: { name: string; amount: number; message: string; time: string }[];
  titleSponsors: { name: string; url: string; logo_url?: string | null; description?: string | null }[];
  platinumSponsors: { name: string; url: string; logo_url?: string | null; description?: string | null }[];
  goldSponsors: { name: string; url: string; logo_url?: string | null; description?: string | null }[];
  silverSponsors: { name: string; url: string; logo_url?: string | null; description?: string | null }[];
  bronzeSponsors: { name: string; url: string; logo_url?: string | null; description?: string | null }[];
  communitySponsors: { name: string; url: string; logo_url?: string | null; description?: string | null }[];
  missionItems: { icon: string; label: string; desc: string }[];
  showLeaderboard: boolean;
  showProgramIdentity: boolean;
  showShareSection: boolean;
  showFundUses: boolean;
  showRecentDonations: boolean;
  showSponsors: boolean;
  showDonationCard: boolean;
  selectedAmount: string;
  setSelectedAmount: (v: string) => void;
  customAmount: string;
  setCustomAmount: (v: string) => void;
  donorName: string;
  setDonorName: (v: string) => void;
  selectedAthlete: string;
  setSelectedAthlete: (v: string) => void;
  donationMessage: string;
  setDonationMessage: (v: string) => void;
  donating: boolean;
  donateError: string;
  donateLabel: string;
  handleDonate: () => void;
  copyConfirm: boolean;
  shareNote: string;
  handleCopyLink: () => void;
  handleText: () => void;
  handleEmail: () => void;
  handleSocial: () => void;
};

export default function PremiumLayout({
  schoolName, sportName, mascot, primaryColor, secondaryColor,
  location, season, logoUrl,
  raised, donors, goal, daysLeft, percent,
  athletes, filteredAthletes, filters, activeFilter, setActiveFilter,
  recentDonations,
  titleSponsors, platinumSponsors, goldSponsors, silverSponsors, bronzeSponsors, communitySponsors,
  missionItems,
  showLeaderboard, showProgramIdentity, showShareSection,
  showFundUses, showRecentDonations, showSponsors, showDonationCard,
  selectedAmount, setSelectedAmount, customAmount, setCustomAmount,
  donorName, setDonorName, selectedAthlete, setSelectedAthlete,
  donationMessage, setDonationMessage,
  donating, donateError, donateLabel, handleDonate,
  copyConfirm, shareNote, handleCopyLink, handleText, handleEmail, handleSocial,
}: PremiumLayoutProps) {
  const displayAmount =
    selectedAmount === "Custom"
      ? customAmount ? `$${customAmount}` : "Custom Amount"
      : selectedAmount;

  return (
    <>
      {/* NAV */}
      <nav className="cl-nav">
        <a href="/" className="cl-nav-logo">
          <Image src="/ELF.LOGO.png" alt="Elite Level Fundraising" width={180} height={52} className="cl-nav-logo-img" priority />
          <span className="cl-nav-logo-text">Elite Level Fundraising</span>
        </a>
        <div className="cl-nav-links">
          {showDonationCard && <a href="#donate" className="cl-nav-link cl-nav-link-cta">Donate</a>}
          {showLeaderboard  && <a href="#leaderboard" className="cl-nav-link">Leaderboard</a>}
          {showSponsors     && <a href="#sponsors" className="cl-nav-link">Sponsors</a>}
        </div>
        <span className="cl-live-badge">● LIVE CAMPAIGN</span>
      </nav>

      {/* PREMIUM HERO — full-width gradient banner */}
      <header style={{
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
        padding: "3.5rem 1.5rem 2.5rem",
        textAlign: "center",
        color: "#fff",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <img src={logoUrl} alt={schoolName}
            style={{ width: 80, height: 80, objectFit: "contain", marginBottom: "1rem", filter: "drop-shadow(0 2px 8px rgba(0,0,0,.3))" }} />
          <h1 style={{ margin: "0 0 .4rem", fontSize: "clamp(1.8rem, 5vw, 3rem)", fontWeight: 900, letterSpacing: "-.02em", lineHeight: 1.1 }}>
            {schoolName.toUpperCase()}
          </h1>
          <p style={{ margin: "0 0 1.5rem", fontSize: "1.1rem", opacity: .85, letterSpacing: ".05em", textTransform: "uppercase" }}>
            {sportName} &nbsp;·&nbsp; {location} &nbsp;·&nbsp; {season}
          </p>

          {/* Stats row */}
          <div style={{ display: "flex", justifyContent: "center", gap: "2.5rem", flexWrap: "wrap", marginBottom: "1.75rem" }}>
            {[
              { val: `$${raised.toLocaleString()}`, label: "raised" },
              { val: `$${goal.toLocaleString()}`, label: "goal" },
              { val: String(donors), label: "donors" },
              { val: String(daysLeft), label: "days left" },
            ].map(({ val, label }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2rem", fontWeight: 900, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: ".75rem", opacity: .75, textTransform: "uppercase", letterSpacing: ".08em", marginTop: ".25rem" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ background: "rgba(255,255,255,.25)", borderRadius: 999, height: 10, maxWidth: 480, margin: "0 auto 1.5rem", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(percent, 100)}%`, background: "#fff", borderRadius: 999, transition: "width .6s ease" }} />
          </div>
          <div style={{ fontSize: ".85rem", opacity: .8, marginBottom: "1.75rem" }}>{percent}% of goal · ${(goal - raised).toLocaleString()} still needed</div>

          {showDonationCard && (
            <a href="#donate" style={{
              display: "inline-block", background: "#fff", color: primaryColor,
              fontWeight: 800, fontSize: "1rem", padding: ".85rem 2.5rem",
              borderRadius: 999, textDecoration: "none", letterSpacing: ".02em",
              boxShadow: "0 4px 20px rgba(0,0,0,.18)",
            }}>
              Donate Now →
            </a>
          )}
        </div>
      </header>

      {/* BODY */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>

        {/* DONATION CARD — inline, full-width */}
        {showDonationCard && (
          <div id="donate" className="cl-donate-card" style={{ marginBottom: "2rem", boxShadow: "0 4px 32px rgba(0,0,0,.10)" }}>
            <div className="cl-donate-header">
              <h2>DONATE TO THE {mascot.toUpperCase()}</h2>
              <p>Support {schoolName} {sportName}</p>
            </div>
            <div className="cl-donate-body">
              <p className="cl-field-label">Choose an amount</p>
              <div className="cl-amounts">
                {(["$25", "$50", "$100", "$250", "Custom"] as const).map((amt) => (
                  <button key={amt} className={`cl-amount-btn${selectedAmount === amt ? " active" : ""}`}
                    onClick={() => setSelectedAmount(amt)}>
                    {amt}
                  </button>
                ))}
              </div>

              {selectedAmount === "Custom" && (
                <div className="cl-form-field cl-custom-amount-field">
                  <label>Enter amount ($)</label>
                  <input type="number" min="1" placeholder="Enter amount" value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)} />
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div className="cl-form-field">
                  <label>Your Name</label>
                  <input type="text" placeholder="Jane Smith" value={donorName}
                    onChange={(e) => setDonorName(e.target.value)} />
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
              </div>

              <div className="cl-form-field">
                <label>Leave a message <span className="cl-optional">(optional)</span></label>
                <textarea rows={2} placeholder={`Go ${mascot}! We're rooting for you this season.`}
                  value={donationMessage} onChange={(e) => setDonationMessage(e.target.value)} />
              </div>

              <button className="cl-donate-btn" onClick={handleDonate} disabled={donating}>
                {donating ? "Redirecting to Stripe…" : donateLabel}
              </button>
              {donateError && <p className="cl-donate-error">{donateError}</p>}
              <p className="cl-stripe-note">🔒 Secure checkout powered by Stripe</p>
            </div>
          </div>
        )}

        {/* LEADERBOARD */}
        {showLeaderboard && (
          <div className="cl-card" id="leaderboard" style={{ marginBottom: "1.5rem" }}>
            <h2 className="cl-card-title">ATHLETE LEADERBOARD</h2>
            <p className="cl-card-sub">Top fundraisers on the team this season</p>
            <div className="cl-filter-tabs">
              {filters.map((f) => (
                <button key={f} className={`cl-filter-tab${activeFilter === f ? " active" : ""}`}
                  onClick={() => setActiveFilter(f)}>
                  {f}
                </button>
              ))}
            </div>
            {filteredAthletes.length > 0 ? (
              <div style={{ display: "grid", gap: ".6rem", marginTop: ".75rem" }}>
                {filteredAthletes.map((a) => (
                  <div key={a.rank} style={{
                    display: "flex", alignItems: "center", gap: "1rem",
                    padding: ".75rem 1rem", borderRadius: 10,
                    background: a.displayRank === 1 ? `${primaryColor}12` : "#f9fafb",
                    border: a.displayRank === 1 ? `1.5px solid ${primaryColor}30` : "1.5px solid #f3f4f6",
                  }}>
                    <span style={{ fontSize: "1.4rem", width: 36, textAlign: "center" }}>{rankIcon(a.displayRank)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#0b1e3d" }}>{a.name}</div>
                      <div style={{ fontSize: ".75rem", color: "#9ca3af" }}>{a.class_year ?? a.event}</div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: "1rem", color: primaryColor }}>${a.raised.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="cl-filter-empty">No athletes in this event group yet.</div>
            )}
          </div>
        )}

        {/* PROGRAM IDENTITY */}
        {showProgramIdentity && (
          <div className="cl-card cl-identity-card" style={{ marginBottom: "1.5rem" }}>
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
        )}

        {/* FUND USES */}
        {showFundUses && (
          <div className="cl-card" id="mission" style={{ marginBottom: "1.5rem" }}>
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
          <div className="cl-card" id="donations" style={{ marginBottom: "1.5rem" }}>
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
        )}

        {/* SHARE */}
        {showShareSection && (
          <div className="cl-card" id="share" style={{ marginBottom: "1.5rem" }}>
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
      </div>

      {/* SPONSORS */}
      {showSponsors && (
        <section className="cl-sponsors" id="sponsors">
          <div className="cl-section-inner">
            <p className="section-label">Community Partners</p>
            <h2 className="cl-sponsors-title">OUR LOCAL SPONSORS</h2>
            <p className="cl-sponsors-sub">Businesses investing in our student athletes</p>
            {([
              { key: "title",             items: titleSponsors,     label: "👑 Title Sponsor",      cls: "cl-logo-title"     },
              { key: "platinum",          items: platinumSponsors,  label: "💎 Platinum Sponsors",  cls: "cl-logo-platinum"  },
              { key: "gold",              items: goldSponsors,      label: "🥇 Gold Sponsors",      cls: "cl-logo-gold"      },
              { key: "silver",            items: silverSponsors,    label: "🥈 Silver Sponsors",    cls: "cl-logo-silver"    },
              { key: "bronze",            items: bronzeSponsors,    label: "🥉 Bronze Sponsors",    cls: "cl-logo-bronze"    },
              { key: "community_partner", items: communitySponsors, label: "🤝 Community Partners", cls: "cl-logo-community" },
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
          <p className="cl-footer-copy">© 2025 Elite Level Fundraising · All rights reserved</p>
        </div>
      </footer>

      {/* Powered by (below footer for premium) */}
      <div className="cl-powered-by" style={{ justifyContent: "center", paddingBottom: "1.5rem" }}>
        <Image src="/ELF.LOGO.png" alt="Elite Level Fundraising" width={100} height={28} className="cl-powered-logo-img" />
        <span>Powered by Elite Level Fundraising</span>
      </div>
    </>
  );
}
