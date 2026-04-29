import Image from "next/image";
import "./campaign.css";

const raised = 12850;
const goal = 25000;
const percent = Math.round((raised / goal) * 100);
const donors = 147;
const daysLeft = 23;

const athletes = [
  { rank: 1, name: "Marcus Johnson",  event: "Sprints",  raised: 2340 },
  { rank: 2, name: "Aaliyah Rivera",  event: "Distance", raised: 1980 },
  { rank: 3, name: "Tyler Chen",      event: "Jumps",    raised: 1620 },
  { rank: 4, name: "Sofia Martinez",  event: "Throws",   raised: 1410 },
  { rank: 5, name: "Devon Williams",  event: "Hurdles",  raised: 1200 },
];

const recentDonations = [
  { name: "Robert T.",       amount: 100, message: "Go Pumas! Proud to support Arizona track!",   time: "2 hours ago" },
  { name: "Sarah K.",        amount: 50,  message: "Best of luck this season!",                   time: "4 hours ago" },
  { name: "Anonymous",       amount: 250, message: "Keep running strong!",                        time: "6 hours ago" },
  { name: "Mike & Janet L.", amount: 75,  message: "Our daughter loves this team. Go Pumas!",     time: "1 day ago"   },
  { name: "Coach R.",        amount: 25,  message: "Proud of this program!",                      time: "1 day ago"   },
];

const goldSponsors   = ["Desert Auto Group", "Valley Medical Center"];
const silverSponsors = ["Arizona Roofing Pro", "Mesa Family Chiro", "Sunbelt Insurance"];
const bronzeSponsors = ["Cactus Brewing Co", "Paradise Valley Diner", "AZ Sports Therapy"];

const missionItems = [
  { icon: "✈️", label: "Travel & Transportation", desc: "Away meets, regional championships, and travel to compete across Arizona and beyond." },
  { icon: "📋", label: "Meet Entry Fees",          desc: "Registration costs for conference meets, invitationals, and state qualifiers." },
  { icon: "👟", label: "Equipment & Gear",         desc: "Spikes, throwing implements, poles, hurdles, and training tools." },
  { icon: "👕", label: "Uniforms",                 desc: "Competition singlets, warm-up suits, and team apparel for all athletes." },
  { icon: "💪", label: "Recovery Tools",           desc: "Foam rollers, resistance bands, ice packs, and injury prevention equipment." },
  { icon: "🍱", label: "Team Meals",               desc: "Pre-meet fueling and post-competition meals to keep athletes performing at their best." },
];

const rankIcon = (r: number) =>
  r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : `#${r}`;

export default function CampaignPage() {
  return (
    <>
      {/* ── NAV ── */}
      <nav className="cp-nav">
        <a href="/" className="cp-nav-logo">
          <Image
            src="/ELF.LOGO.png"
            alt="Elite Level Fundraising"
            width={180}
            height={52}
            className="cp-nav-logo-img"
            priority
          />
          <span className="cp-nav-logo-text">Elite Level Fundraising</span>
        </a>
        <span className="cp-live-badge">● LIVE CAMPAIGN</span>
      </nav>

      {/* ── HERO ── */}
      <header className="cp-hero">

        {/* School branding strip */}
        <div className="cp-school-header">
          <div className="cp-school-header-inner">
            <Image
              src="/pvcc-logo.png"
              alt="Paradise Valley Community College"
              width={56}
              height={56}
              className="cp-school-pvcc-logo"
            />
            <div className="cp-school-info">
              <div className="cp-school-name">PARADISE VALLEY PUMAS</div>
              <div className="cp-school-meta">
                Track &amp; Field &nbsp;·&nbsp; Paradise Valley, Arizona &nbsp;·&nbsp; 2025 Season
              </div>
            </div>
            <div className="cp-school-season-badge">🐾 2025 SEASON</div>
          </div>
        </div>

        <div className="cp-hero-inner">
          <div className="cp-hero-text">
            <div className="cp-badge">🏃 Track &amp; Field · Paradise Valley, AZ</div>
            <h1>
              PARADISE VALLEY<br />
              COMMUNITY COLLEGE<br />
              <em>TRACK &amp; FIELD</em>
            </h1>
            <p className="cp-hero-sub">
              Support the Paradise Valley Pumas Track &amp; Field program as they prepare for another
              competitive season representing Paradise Valley Community College.
            </p>
            <div className="cp-hero-stats">
              <div className="cp-hero-stat">
                <strong>${raised.toLocaleString()}</strong>
                <span>raised of ${goal.toLocaleString()}</span>
              </div>
              <div className="cp-stat-divider" />
              <div className="cp-hero-stat">
                <strong>{donors}</strong>
                <span>donors</span>
              </div>
              <div className="cp-stat-divider" />
              <div className="cp-hero-stat">
                <strong>{daysLeft}</strong>
                <span>days left</span>
              </div>
            </div>
            <a href="#donate" className="cp-hero-cta">Donate Now →</a>
          </div>
          <div className="cp-hero-visual">
            <div className="cp-img-placeholder">
              <div className="cp-img-accent" />
              <div className="cp-img-content">
                <Image
                  src="/pvcc-logo.png"
                  alt="PVCC"
                  width={68}
                  height={68}
                  className="cp-img-pvcc-logo"
                />
                <div className="cp-img-school-name">PARADISE VALLEY</div>
                <div className="cp-img-mascot-name">PUMAS</div>
                <div className="cp-img-divider" />
                <div className="cp-img-sport">TRACK &amp; FIELD</div>
                <div className="cp-img-year">2025 SEASON · ARIZONA</div>
              </div>
              <div className="cp-img-grass-bar" />
            </div>
          </div>
        </div>
      </header>

      {/* ── PROGRESS STRIP ── */}
      <div className="cp-progress-strip">
        <div className="cp-section-inner">
          <div className="cp-progress-labels">
            <span className="cp-progress-raised">${raised.toLocaleString()} raised</span>
            <span className="cp-progress-pct">{percent}% of ${goal.toLocaleString()} goal</span>
          </div>
          <div className="cp-progress-track">
            <div className="cp-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="cp-progress-meta">
            <span>{donors} donors</span>
            <span>·</span>
            <span>{daysLeft} days remaining</span>
            <span>·</span>
            <span>${(goal - raised).toLocaleString()} still needed</span>
          </div>
        </div>
      </div>

      {/* ── MAIN TWO-COLUMN LAYOUT ── */}
      <div className="cp-main">
        <div className="cp-main-inner">

          {/* LEFT: leaderboard + program identity + share + mission + recent donations */}
          <div className="cp-left">

            {/* LEADERBOARD */}
            <div className="cp-card" id="leaderboard">
              <h2 className="cp-card-title">ATHLETE LEADERBOARD</h2>
              <p className="cp-card-sub">Top fundraisers on the team this season</p>
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Athlete</th>
                    <th>Event Group</th>
                    <th>Raised</th>
                  </tr>
                </thead>
                <tbody>
                  {athletes.map((a) => (
                    <tr key={a.rank} className={a.rank === 1 ? "cp-row-gold" : ""}>
                      <td className="cp-td-rank">{rankIcon(a.rank)}</td>
                      <td className="cp-td-name">{a.name}</td>
                      <td className="cp-td-event">{a.event}</td>
                      <td className="cp-td-amount">${a.raised.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* PROGRAM IDENTITY */}
            <div className="cp-card cp-identity-card">
              <div className="cp-identity-header">
                <Image
                  src="/pvcc-logo.png"
                  alt="PVCC"
                  width={52}
                  height={52}
                  className="cp-identity-pvcc-logo"
                />
                <div className="cp-identity-header-text">
                  <h2 className="cp-card-title">PROGRAM IDENTITY</h2>
                  <p className="cp-card-sub">Paradise Valley Community College Athletics</p>
                </div>
              </div>
              <div className="cp-identity-grid">
                <div className="cp-identity-item">
                  <div className="cp-identity-label">Mascot</div>
                  <div className="cp-identity-value">🐾 Pumas</div>
                </div>
                <div className="cp-identity-item">
                  <div className="cp-identity-label">Colors</div>
                  <div className="cp-identity-value cp-identity-colors">
                    <span className="cp-color-swatch cp-swatch-navy" title="Royal Blue" />
                    <span className="cp-color-swatch cp-swatch-green" title="Sand" />
                    <span className="cp-color-swatch cp-swatch-gold" title="White" />
                    <span className="cp-swatch-labels">Royal Blue · Sand · White</span>
                  </div>
                </div>
                <div className="cp-identity-item">
                  <div className="cp-identity-label">Program</div>
                  <div className="cp-identity-value">Men&apos;s &amp; Women&apos;s Track &amp; Field</div>
                </div>
                <div className="cp-identity-item">
                  <div className="cp-identity-label">School</div>
                  <div className="cp-identity-value">Paradise Valley Community College</div>
                </div>
              </div>
            </div>

            {/* SHARE */}
            <div className="cp-card cp-share-card">
              <h2 className="cp-card-title">SHARE THIS CAMPAIGN</h2>
              <p className="cp-card-sub">Help us reach our goal — every share brings us closer</p>
              <div className="cp-share-grid">
                <button className="cp-share-btn">
                  <span className="cp-share-icon">🔗</span> Copy Link
                </button>
                <button className="cp-share-btn">
                  <span className="cp-share-icon">💬</span> Text
                </button>
                <button className="cp-share-btn">
                  <span className="cp-share-icon">✉️</span> Email
                </button>
                <button className="cp-share-btn">
                  <span className="cp-share-icon">📲</span> Social
                </button>
              </div>
            </div>

            {/* MISSION */}
            <div className="cp-card" id="mission">
              <h2 className="cp-card-title">WHERE YOUR MONEY GOES</h2>
              <p className="cp-card-sub">Every dollar raised supports student athletes directly</p>
              <div className="cp-mission-grid">
                {missionItems.map((item) => (
                  <div className="cp-mission-item" key={item.label}>
                    <div className="cp-mission-icon">{item.icon}</div>
                    <div>
                      <h4>{item.label}</h4>
                      <p>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* RECENT DONATIONS */}
            <div className="cp-card" id="donations">
              <h2 className="cp-card-title">RECENT DONATIONS</h2>
              <p className="cp-card-sub">Join the supporters cheering on the Pumas</p>
              <div className="cp-donations-list">
                {recentDonations.map((d, i) => (
                  <div className="cp-donation-item" key={i}>
                    <div className="cp-avatar">{d.name[0]}</div>
                    <div className="cp-donation-body">
                      <div className="cp-donation-top">
                        <span className="cp-donation-name">{d.name}</span>
                        <span className="cp-donation-amount">${d.amount}</span>
                      </div>
                      {d.message && (
                        <p className="cp-donation-msg">&ldquo;{d.message}&rdquo;</p>
                      )}
                      <span className="cp-donation-time">{d.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: sticky donation card */}
          <div className="cp-right">
            <div className="cp-donate-card" id="donate">
              <div className="cp-donate-header">
                <h2>DONATE TO THE PUMAS</h2>
                <p>Support Paradise Valley Track &amp; Field</p>
              </div>
              <div className="cp-donate-body">
                <p className="cp-field-label">Choose an amount</p>
                <div className="cp-amounts">
                  {(["$25", "$50", "$100", "$250", "Custom"] as const).map(
                    (amt, i) => (
                      <button key={amt} className={`cp-amount-btn${i === 1 ? " active" : ""}`}>
                        {amt}
                      </button>
                    )
                  )}
                </div>

                <div className="cp-form-field">
                  <label>Your Name</label>
                  <input type="text" placeholder="Jane Smith" />
                </div>

                <div className="cp-form-field">
                  <label>
                    Support a specific athlete{" "}
                    <span className="cp-optional">(optional)</span>
                  </label>
                  <select>
                    <option value="">— Team General Fund —</option>
                    {athletes.map((a) => (
                      <option key={a.name} value={a.name}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div className="cp-form-field">
                  <label>
                    Leave a message{" "}
                    <span className="cp-optional">(optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Go Pumas! We're rooting for you this season."
                  />
                </div>

                <button className="cp-donate-btn">
                  Donate $50 to the Pumas →
                </button>
                <p className="cp-stripe-note">🔒 Secure checkout powered by Stripe</p>
              </div>
            </div>

            {/* Powered by ELF */}
            <div className="cp-powered-by">
              <Image
                src="/ELF.LOGO.png"
                alt="Elite Level Fundraising"
                width={100}
                height={28}
                className="cp-powered-logo-img"
              />
              <span>Powered by Elite Level Fundraising</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── SPONSORS ── */}
      <section className="cp-sponsors" id="sponsors">
        <div className="cp-section-inner">
          <p className="section-label">Community Partners</p>
          <h2 className="cp-sponsors-title">OUR LOCAL SPONSORS</h2>
          <p className="cp-sponsors-sub">
            Arizona businesses investing in Paradise Valley student athletes
          </p>

          <div className="cp-tier">
            <div className="cp-tier-label cp-tier-gold">🥇 Gold Sponsors</div>
            <div className="cp-tier-logos">
              {goldSponsors.map((s) => (
                <div key={s} className="cp-sponsor-logo cp-logo-gold">{s}</div>
              ))}
            </div>
          </div>

          <div className="cp-tier">
            <div className="cp-tier-label cp-tier-silver">🥈 Silver Sponsors</div>
            <div className="cp-tier-logos">
              {silverSponsors.map((s) => (
                <div key={s} className="cp-sponsor-logo cp-logo-silver">{s}</div>
              ))}
            </div>
          </div>

          <div className="cp-tier">
            <div className="cp-tier-label cp-tier-bronze">🥉 Bronze Sponsors</div>
            <div className="cp-tier-logos">
              {bronzeSponsors.map((s) => (
                <div key={s} className="cp-sponsor-logo cp-logo-bronze">{s}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="cp-footer">
        <div className="cp-footer-inner">
          <div className="cp-footer-logo">
            <Image
              src="/ELF.LOGO.png"
              alt="Elite Level Fundraising"
              width={200}
              height={64}
              className="cp-footer-logo-img"
            />
            <span className="cp-footer-logo-text">Elite Level Fundraising</span>
          </div>
          <p className="cp-footer-team">
            Paradise Valley Community College · Track &amp; Field · 2025 Season
          </p>
          <p className="cp-footer-copy">
            © 2025 Elite Level Fundraising · Arizona · All rights reserved
          </p>
        </div>
      </footer>
    </>
  );
}
