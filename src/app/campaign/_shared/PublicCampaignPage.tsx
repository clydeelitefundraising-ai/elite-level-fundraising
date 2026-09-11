"use client";

import { useState } from "react";
import { Heart, Users, Calendar, Search, Lock, ArrowRight, Menu, X } from "lucide-react";
import { currentCopyrightYear } from "@/lib/copyrightYear";
import { resolveFundUseIcon } from "@/lib/fundUseIcons";

// Fund-uses column count follows the actual item count (1-6) so 1/2/4
// items never leave an awkward near-empty trailing row on desktop — see
// the matching .pc-fund-grid--cols-* rules in campaign.css. 3/5/6 keep the
// reference's 3-wide layout (3+2 or 3+3 reads as intentional, unlike 3+1).
function fundGridColumnClass(count: number): string {
  if (count === 1) return "pc-fund-grid pc-fund-grid--cols-1";
  if (count === 2) return "pc-fund-grid pc-fund-grid--cols-2";
  if (count === 4) return "pc-fund-grid pc-fund-grid--cols-4";
  return "pc-fund-grid";
}

type SponsorItem = { name: string; url: string; logo_url?: string | null; description?: string | null };
type Athlete = { id: string; rank: number; name: string; event: string | null; class_year: string | null; raised: number };
// Phase A35: a leaderboard row is either an athlete or a participating
// coach. Coach rows never carry a grade/event — role is shown instead.
type LeaderboardEntry = Athlete & { kind: "athlete" | "coach"; role?: "head_coach" | "assistant_coach" };
type CoachParticipant = { id: string; name: string; role: "head_coach" | "assistant_coach"; raised: number; goal_cents: number | null };
type MissionItem = { icon: string; label: string; desc: string };
type Donation = { name: string; amount: number; message: string; time: string };

function coachRoleLabel(role: "head_coach" | "assistant_coach"): string {
  return role === "head_coach" ? "Head Coach" : "Assistant Coach";
}

// Same initials fallback treatment as TeamHeader.tsx's header logo slot —
// the one authoritative "no logo configured" rendering for team identity
// anywhere in the app. Never an ELF logo standing in for team identity.
function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export type PublicCampaignPageProps = {
  slug: string;
  schoolName: string;
  sportName: string;
  mascot: string;
  themePrimaryColor: string;
  location: string;
  season: string;
  logoUrl: string;
  description: string;
  raised: number;
  donors: number;
  goal: number;
  daysLeft: number;
  percent: number;
  athletes: Athlete[];
  filteredAthletes: (LeaderboardEntry & { displayRank: number })[];
  filters: string[];
  activeFilter: string;
  setActiveFilter: (f: string) => void;
  coaches: CoachParticipant[];
  allowCoachFundraising: boolean;
  selectedCoachId: string;
  selectAthleteParticipant: (id: string) => void;
  selectCoachParticipant: (id: string) => void;
  participantFilter: "All" | "Athletes" | "Coaches";
  setParticipantFilter: (f: "All" | "Athletes" | "Coaches") => void;
  recentDonations: Donation[];
  titleSponsors: SponsorItem[];
  platinumSponsors: SponsorItem[];
  goldSponsors: SponsorItem[];
  silverSponsors: SponsorItem[];
  bronzeSponsors: SponsorItem[];
  communitySponsors: SponsorItem[];
  missionItems: MissionItem[];
  showLeaderboard: boolean;
  showFundUses: boolean;
  showRecentDonations: boolean;
  showSponsors: boolean;
  showDonationCard: boolean;
  selectedAmount: string;
  setSelectedAmount: (a: string) => void;
  customAmount: string;
  setCustomAmount: (a: string) => void;
  donorName: string;
  setDonorName: (n: string) => void;
  selectedAthleteId: string;
  donationMessage: string;
  setDonationMessage: (m: string) => void;
  donating: boolean;
  donateError: string;
  donateLabel: string;
  handleDonate: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  leaderboardExpanded: boolean;
  setLeaderboardExpanded: (v: boolean) => void;
  donationsExpanded: boolean;
  setDonationsExpanded: (v: boolean) => void;
  hasMoreDonations: boolean;
};

const LEADERBOARD_PREVIEW_COUNT = 5;

export default function PublicCampaignPage(props: PublicCampaignPageProps) {
  const {
    schoolName, sportName, mascot, location, season, logoUrl, description,
    raised, donors, goal, daysLeft, percent,
    athletes, filteredAthletes, filters, activeFilter, setActiveFilter,
    coaches, allowCoachFundraising, selectedCoachId,
    selectAthleteParticipant, selectCoachParticipant,
    participantFilter, setParticipantFilter,
    recentDonations, titleSponsors, platinumSponsors, goldSponsors, silverSponsors, bronzeSponsors, communitySponsors,
    missionItems,
    showLeaderboard, showFundUses, showRecentDonations, showSponsors, showDonationCard,
    selectedAmount, setSelectedAmount, customAmount, setCustomAmount,
    donorName, setDonorName, selectedAthleteId,
    donationMessage, setDonationMessage,
    donating, donateError, donateLabel, handleDonate,
    searchQuery, setSearchQuery, leaderboardExpanded, setLeaderboardExpanded,
    donationsExpanded, setDonationsExpanded, hasMoreDonations,
  } = props;

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const searchedAthletes = searchQuery.trim()
    ? filteredAthletes.filter((a) => a.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : filteredAthletes;
  const visibleAthletes = leaderboardExpanded ? searchedAthletes : searchedAthletes.slice(0, LEADERBOARD_PREVIEW_COUNT);
  const visibleDonations = donationsExpanded ? recentDonations : recentDonations.slice(0, 5);

  const sponsorGroups = ([
    { key: "title", label: "Title Sponsor", items: titleSponsors },
    { key: "platinum", label: "Platinum Sponsors", items: platinumSponsors },
    { key: "gold", label: "Gold Sponsors", items: goldSponsors },
    { key: "silver", label: "Silver Sponsors", items: silverSponsors },
    { key: "bronze", label: "Bronze Sponsors", items: bronzeSponsors },
    { key: "community_partner", label: "Community Partners", items: communitySponsors },
  ] as const).filter((g) => g.items.length > 0);

  return (
    <div className="pc-page">
      {/* NAV */}
      <nav className="pc-nav">
        <div className="pc-nav-inner">
          <a href="#pc-about" className="pc-nav-brand">
            <img src="/marketing/brand/elf-logo-h-black.png" alt="Elite Level Fundraising" className="pc-nav-logo" />
          </a>
          <div className="pc-nav-links">
            <a href="#pc-about" className="pc-nav-link">About</a>
            <a href="#pc-team" className="pc-nav-link">Our Team</a>
            {showSponsors && <a href="#pc-sponsors" className="pc-nav-link">Sponsors</a>}
            {showRecentDonations && <a href="#pc-updates" className="pc-nav-link">Updates</a>}
            <a href="#pc-contact" className="pc-nav-link">Contact</a>
          </div>
          <div className="pc-nav-right">
            {showDonationCard && <a href="#pc-donate" className="pc-nav-cta">Donate Now</a>}
            <button
              type="button"
              className="pc-nav-burger"
              aria-label="Menu"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((v) => !v)}
            >
              {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        <div className={`pc-nav-mobile-panel${mobileNavOpen ? " open" : ""}`}>
          <a href="#pc-about" onClick={() => setMobileNavOpen(false)}>About</a>
          <a href="#pc-team" onClick={() => setMobileNavOpen(false)}>Our Team</a>
          {showSponsors && <a href="#pc-sponsors" onClick={() => setMobileNavOpen(false)}>Sponsors</a>}
          {showRecentDonations && <a href="#pc-updates" onClick={() => setMobileNavOpen(false)}>Updates</a>}
          <a href="#pc-contact" onClick={() => setMobileNavOpen(false)}>Contact</a>
        </div>
      </nav>

      {/* HERO */}
      <header className="pc-hero" id="pc-about">
        <div className="pc-section-inner pc-hero-grid">
          <div className="pc-hero-area-identity">
            <div className="pc-hero-identity">
              {logoUrl
                ? <img src={logoUrl} alt={schoolName} className="pc-hero-logo" />
                : <div className="pc-hero-logo-fallback">{initials(schoolName)}</div>}
              <div>
                <p className="pc-hero-school">{schoolName}</p>
              </div>
            </div>
            <h1 className="pc-hero-title">
              {sportName} <em>{mascot}</em>
            </h1>
            <p className="pc-hero-label">{season} Fundraiser</p>
            <p className="pc-hero-desc">
              {description || `Support the ${schoolName} ${sportName} program as they prepare for another competitive season. Your support makes a direct impact on our student-athletes.`}
            </p>
          </div>

          <div className="pc-hero-area-progress">
            <div className="pc-hero-amount-row">
              <span className="pc-hero-amount">${raised.toLocaleString()}</span>
              <span className="pc-hero-goal">of ${goal.toLocaleString()} goal</span>
            </div>
            <div className="pc-progress-row">
              <div className="pc-progress-track">
                <div className="pc-progress-fill" style={{ width: `${Math.min(100, percent)}%` }} />
              </div>
              <span className="pc-progress-pct">{percent}%</span>
            </div>
          </div>

          {showDonationCard && (
            <div className="pc-hero-area-donate" id="pc-donate">
              <div className="pc-donate-card">
                <div className="pc-donate-header">
                  <h2>Support the {mascot || sportName}</h2>
                  <p>Make a difference for {schoolName} {sportName}</p>
                </div>
                <div className="pc-donate-body">
                  <p className="pc-field-label">Choose an amount</p>
                  <div className="pc-amounts">
                    {(["$25", "$50", "$100"] as const).map((amt) => (
                      <button key={amt} className={`pc-amount-btn${selectedAmount === amt ? " active" : ""}`} onClick={() => setSelectedAmount(amt)}>
                        {amt}
                      </button>
                    ))}
                    <button
                      className={`pc-amount-btn${selectedAmount === "$250" ? " active" : ""}`}
                      onClick={() => setSelectedAmount("$250")}
                    >
                      $250
                    </button>
                    <button
                      className={`pc-amount-btn pc-amount-custom${selectedAmount === "Custom" ? " active" : ""}`}
                      onClick={() => setSelectedAmount("Custom")}
                    >
                      Custom
                    </button>
                  </div>

                  {selectedAmount === "Custom" && (
                    <div className="pc-form-field">
                      <label>Enter amount ($)</label>
                      <input type="number" min="1" placeholder="Enter amount" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} />
                    </div>
                  )}

                  <div className="pc-form-field">
                    <label>Your Name</label>
                    <input type="text" placeholder="Jane Smith" value={donorName} onChange={(e) => setDonorName(e.target.value)} />
                  </div>

                  <div className="pc-form-field">
                    <label>Credit Your Donation To <span className="pc-optional">(optional)</span></label>
                    <select
                      value={selectedAthleteId ? `athlete:${selectedAthleteId}` : selectedCoachId ? `coach:${selectedCoachId}` : ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) { selectAthleteParticipant(""); return; }
                        const [kind, id] = value.split(":");
                        if (kind === "coach") selectCoachParticipant(id);
                        else selectAthleteParticipant(id);
                      }}
                    >
                      <option value="">— Team General Fund —</option>
                      {athletes.length > 0 && (
                        <optgroup label="Athletes">
                          {athletes.map((a) => (
                            <option key={a.id} value={`athlete:${a.id}`}>{a.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {allowCoachFundraising && coaches.length > 0 && (
                        <optgroup label="Coaches">
                          {coaches.map((c) => (
                            <option key={c.id} value={`coach:${c.id}`}>{c.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div className="pc-form-field">
                    <label>Leave a Message <span className="pc-optional">(optional)</span></label>
                    <textarea rows={3} placeholder={`Go ${mascot || sportName}! We're rooting for you this season.`} value={donationMessage} onChange={(e) => setDonationMessage(e.target.value)} />
                  </div>

                  <button className="pc-donate-btn" onClick={handleDonate} disabled={donating}>
                    {donating ? "Redirecting to Stripe…" : donateLabel}
                  </button>
                  {donateError && <p className="pc-donate-error">{donateError}</p>}
                  <p className="pc-stripe-note"><Lock size={13} /> Secure checkout powered by Stripe</p>
                </div>
              </div>
            </div>
          )}

          <div className="pc-hero-area-stats">
            <div className="pc-hero-stats">
              <div className="pc-hero-stat">
                <Heart className="pc-hero-stat-icon" size={22} fill="currentColor" />
                <div><strong>{donors}</strong><span>Donations</span></div>
              </div>
              <div className="pc-hero-stat-divider" />
              <div className="pc-hero-stat">
                <Users className="pc-hero-stat-icon" size={22} />
                <div><strong>{sponsorGroups.reduce((n, g) => n + g.items.length, 0)}</strong><span>Sponsors</span></div>
              </div>
              <div className="pc-hero-stat-divider" />
              <div className="pc-hero-stat">
                <Calendar className="pc-hero-stat-icon" size={22} />
                <div><strong>{daysLeft}</strong><span>Days Left</span></div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* TOP FUNDRAISERS */}
      {showLeaderboard && (
        <section className="pc-section" id="pc-team">
          <div className="pc-section-inner">
            <div className="pc-section-header">
              <div>
                <h2 className="pc-h2">Top Fundraisers</h2>
                <p className="pc-subcopy">Support a specific athlete and help them reach their goals.</p>
              </div>
            </div>
            <div className="pc-lb-controls">
              <div className="pc-search-wrap">
                <Search size={15} />
                <input placeholder={allowCoachFundraising && coaches.length > 0 ? "Search athletes or coaches by name…" : "Search athletes by name…"} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <div className="pc-filter-tabs">
                {filters.map((f) => (
                  <button key={f} className={`pc-filter-tab${activeFilter === f ? " active" : ""}`} onClick={() => setActiveFilter(f)}>
                    {f}
                  </button>
                ))}
              </div>
              {allowCoachFundraising && coaches.length > 0 && activeFilter === "Overall" && (
                <div className="pc-filter-tabs pc-participant-filter">
                  {(["All", "Athletes", "Coaches"] as const).map((f) => (
                    <button key={f} className={`pc-filter-tab${participantFilter === f ? " active" : ""}`} onClick={() => setParticipantFilter(f)}>
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {searchedAthletes.length > 0 ? (
              <>
                <div className="pc-lb-table-wrap">
                  <table className="pc-lb-table">
                    <thead>
                      <tr><th>#</th><th>Athlete</th><th>Grade</th><th>Events</th><th>Amount Raised</th><th /></tr>
                    </thead>
                    <tbody>
                      {visibleAthletes.map((a) => (
                        <tr key={a.id}>
                          <td className="pc-lb-rank">{a.displayRank}</td>
                          <td className="pc-td-athlete">
                            <div className="pc-lb-athlete-cell">
                              <span className="pc-lb-avatar">{initials(a.name)}</span>
                              <span>{a.name}</span>
                              {a.kind === "coach" && <span className="pc-lb-role-pill">{coachRoleLabel(a.role!)}</span>}
                            </div>
                          </td>
                          <td>{a.kind === "coach" ? "—" : (a.class_year ?? "—")}</td>
                          <td>{a.kind === "coach" ? "—" : (a.event ?? "—")}</td>
                          <td className="pc-lb-amount">${a.raised.toLocaleString()}</td>
                          <td><a className="pc-lb-donate-btn" href="#pc-donate" onClick={() => a.kind === "coach" ? selectCoachParticipant(a.id) : selectAthleteParticipant(a.id)}>Donate</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pc-lb-cards">
                  {visibleAthletes.map((a) => (
                    <div className="pc-lb-card" key={a.id}>
                      <span className="pc-lb-avatar">{initials(a.name)}</span>
                      <div className="pc-lb-card-body">
                        <div className="pc-lb-card-name">
                          #{a.displayRank} {a.name}
                          {a.kind === "coach" && <span className="pc-lb-role-pill">{coachRoleLabel(a.role!)}</span>}
                        </div>
                        <div className="pc-lb-card-meta">{a.kind === "coach" ? coachRoleLabel(a.role!) : `${a.class_year ?? "—"} · ${a.event ?? "—"}`}</div>
                      </div>
                      <div>
                        <div className="pc-lb-card-amount">${a.raised.toLocaleString()}</div>
                        <a className="pc-lb-donate-btn" href="#pc-donate" onClick={() => a.kind === "coach" ? selectCoachParticipant(a.id) : selectAthleteParticipant(a.id)}>Donate</a>
                      </div>
                    </div>
                  ))}
                </div>

                {searchedAthletes.length > LEADERBOARD_PREVIEW_COUNT && (
                  <button className="pc-view-all" onClick={() => setLeaderboardExpanded(!leaderboardExpanded)}>
                    {leaderboardExpanded ? "Show fewer athletes" : "View All Athletes"} <ArrowRight size={15} />
                  </button>
                )}
              </>
            ) : (
              <div className="pc-lb-empty">
                {athletes.length === 0 ? "No athletes on the roster yet." : "No athletes match your search."}
              </div>
            )}
          </div>
        </section>
      )}

      {/* WHY WE'RE RAISING FUNDS + FUND USES */}
      <section className="pc-section" style={{ background: "#fafbfc" }}>
        <div className="pc-section-inner pc-story-grid">
          <div>
            <h2 className="pc-h2">Why We&rsquo;re Raising Funds</h2>
            <p className="pc-story-body">
              {description || `Our ${sportName} program provides a positive and competitive environment for student-athletes to grow on and off the field. Your support helps us cover travel to meets, purchase equipment, pay entry fees, and create team experiences that build character, community, and lifelong memories.`}
            </p>
          </div>
          {showFundUses && missionItems.length > 0 && (
            <div>
              <h3 className="pc-fund-heading">Your Support Helps Fund</h3>
              <div className={fundGridColumnClass(Math.min(missionItems.length, 6))}>
                {missionItems.slice(0, 6).map((item) => {
                  const Icon = resolveFundUseIcon(item.icon);
                  return (
                    <div key={item.label} className="pc-fund-item">
                      <Icon className="pc-fund-item-icon" aria-hidden="true" />
                      <p className="pc-fund-item-title">{item.label}</p>
                      <p className="pc-fund-item-desc">{item.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* RECENT SUPPORT + SPONSORS */}
      {(showRecentDonations || showSponsors) && (
        <section className="pc-section" id="pc-updates">
          <div className="pc-section-inner pc-support-grid">
            {showRecentDonations && (
              <div>
                <div className="pc-section-header">
                  <h2 className="pc-h2" style={{ marginBottom: 0 }}>Recent Support</h2>
                  {hasMoreDonations && (
                    <button className="pc-view-all" onClick={() => setDonationsExpanded(!donationsExpanded)}>
                      {donationsExpanded ? "Show less" : "View All"}
                    </button>
                  )}
                </div>
                {recentDonations.length > 0 ? (
                  <div className="pc-donation-list">
                    {visibleDonations.map((d, i) => (
                      <div className="pc-donation-item" key={i}>
                        <span className="pc-lb-avatar">{initials(d.name)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="pc-donation-top">
                            <span className="pc-donation-name">{d.name}<span className="pc-donation-time">{d.time}</span></span>
                            <span className="pc-donation-amount">${d.amount.toLocaleString()}</span>
                          </div>
                          {d.message && <p className="pc-donation-msg">&ldquo;{d.message}&rdquo;</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="pc-empty">No donations yet. Be the first to support this program.</div>
                )}
              </div>
            )}

            {showSponsors && (
              <div id="pc-sponsors">
                <h2 className="pc-h2">Backed by Our Community</h2>
                <p className="pc-subcopy">A huge thank you to our sponsors for investing in our athletes!</p>
                {sponsorGroups.length > 0 ? (
                  sponsorGroups.map((g) => (
                    <div key={g.key}>
                      <p className="pc-sponsor-tier-label">{g.label}</p>
                      <div className="pc-sponsor-grid">
                        {g.items.map((s) => (
                          <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="pc-sponsor-card">
                            {s.logo_url
                              ? <img src={s.logo_url} alt={s.name} className="pc-sponsor-logo-img" />
                              : <span className="pc-sponsor-logo-fallback">{s.name[0]?.toUpperCase() ?? "S"}</span>}
                            <span className="pc-sponsor-name">{s.name}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="pc-empty">No sponsors yet.</div>
                )}
                <a className="pc-become-sponsor" href="/contact">Become a Sponsor <ArrowRight size={15} /></a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* BOTTOM CTA */}
      {showDonationCard && (
        <section className="pc-cta-band">
          <div className="pc-cta-inner">
            <p className="pc-cta-tagline"><span>SAME GRIND.</span><span>BIGGER OPPORTUNITIES.</span></p>
            <div className="pc-cta-center">
              <p className="pc-cta-headline">HELP FUND THEIR SEASON.</p>
              <a className="pc-cta-btn" href="#pc-donate">Donate Now</a>
            </div>
            <div className="pc-cta-brand">
              <img src="/marketing/brand/elf-logo-horizontal.png" alt="Elite Level Fundraising" className="pc-cta-logo" />
            </div>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="pc-footer" id="pc-contact">
        <div className="pc-footer-inner">
          <p className="pc-footer-team">{schoolName} {mascot} · {sportName} {season}{location ? ` · ${location}` : ""}</p>
          <div className="pc-footer-nav">
            <a href="#pc-about">About</a>
            <a href="#pc-team">Our Team</a>
            {showSponsors && <a href="#pc-sponsors">Sponsors</a>}
            {showRecentDonations && <a href="#pc-updates">Updates</a>}
            <a href="#pc-contact">Contact</a>
          </div>
          <div className="pc-footer-powered">
            <span>Powered by</span>
            <img src="/marketing/brand/elf-logo-h-black.png" alt="Elite Level Fundraising" className="pc-footer-logo" />
            <span>· © {currentCopyrightYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
