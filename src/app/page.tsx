export default function Home() {
  return (
    <>
      {/* ── NAVIGATION ── */}
      <nav>
        <div className="nav-logo">
          ELITE LEVEL <span>FUNDRAISING</span>
        </div>
        <ul className="nav-links">
          <li><a href="#why">Why Us</a></li>
          <li><a href="#how">How It Works</a></li>
          <li><a href="#example">Example Page</a></li>
          <li><a href="#sponsors">Sponsors</a></li>
          <li><a href="#contact" className="nav-cta">Get Started</a></li>
        </ul>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-tag">Arizona School Sports</div>
          <h1>
            YOUR TEAM<br />
            DESERVES <em>MORE</em><br />
            THAN A BAKE SALE
          </h1>
          <p className="hero-sub">
            Elite Level Fundraising helps Arizona school sports programs raise
            more money — faster — with a custom donation page, corporate sponsor
            outreach, and optional team merchandise shops.
          </p>
          <div className="btn-group">
            <a href="#contact" className="btn-primary">Request a Free Demo</a>
            <a href="#how" className="btn-secondary">See How It Works</a>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <strong>$0</strong>
              <span>Upfront cost</span>
            </div>
            <div className="hero-stat">
              <strong>48hr</strong>
              <span>Setup time</span>
            </div>
            <div className="hero-stat">
              <strong>100%</strong>
              <span>Arizona local</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHY SECTION ── */}
      <section className="why-section" id="why">
        <div className="section-inner">
          <p className="section-label">Why Elite Level</p>
          <h2 className="section-title">BUILT FOR<br />ARIZONA ATHLETICS</h2>
          <p className="section-sub">
            We understand what ADs, coaches, and booster clubs actually need —
            less admin, more dollars in the budget.
          </p>
          <div className="why-grid">
            <div className="why-card">
              <div className="why-icon">🏆</div>
              <h3>SPORTS FIRST</h3>
              <p>
                Built specifically for school athletic programs, not generic
                charity platforms. Every feature is designed for coaches and ADs.
              </p>
            </div>
            <div className="why-card">
              <div className="why-icon">⚡</div>
              <h3>FAST SETUP</h3>
              <p>
                Your team fundraising page goes live in 48 hours. No tech skills
                required — we handle everything for you.
              </p>
            </div>
            <div className="why-card">
              <div className="why-icon">💰</div>
              <h3>MORE REVENUE</h3>
              <p>
                Multiple income streams: donations, corporate sponsors, and
                merchandise — so your program earns more from every season.
              </p>
            </div>
            <div className="why-card">
              <div className="why-icon">📍</div>
              <h3>LOCAL NETWORK</h3>
              <p>
                We connect you with Arizona businesses who want to invest in
                local youth sports. Real relationships, real sponsorships.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── MORE THAN SECTION ── */}
      <section className="more-section" id="more">
        <div className="section-inner">
          <p className="section-label">More Than Fundraising</p>
          <h2 className="section-title" style={{ color: "var(--white)" }}>
            MULTIPLE REVENUE<br />STREAMS FOR EVERY<br />PROGRAM
          </h2>
          <p className="section-sub">
            One platform. Three ways to generate revenue for your team.
          </p>
          <div className="more-card-hero">
            <h3>BECAUSE YOUR TEAM DESERVES MORE</h3>
            <p>than a basic donation page</p>
            <div className="more-features">
              <div className="more-feature">
                <div className="more-feature-dot"></div>
                <p>
                  <strong style={{ color: "var(--white)" }}>Corporate Sponsor Outreach</strong><br />
                  We reach out to local Arizona businesses on your behalf and
                  secure meaningful sponsorships.
                </p>
              </div>
              <div className="more-feature">
                <div className="more-feature-dot"></div>
                <p>
                  <strong style={{ color: "var(--white)" }}>Custom Team Merch Shops</strong><br />
                  Fans can buy branded gear year-round. Your team earns a cut of
                  every sale — zero inventory hassle.
                </p>
              </div>
              <div className="more-feature">
                <div className="more-feature-dot"></div>
                <p>
                  <strong style={{ color: "var(--white)" }}>Simple Donation Pages</strong><br />
                  A clean, shareable link your players and parents can send to
                  anyone in minutes.
                </p>
              </div>
              <div className="more-feature">
                <div className="more-feature-dot"></div>
                <p>
                  <strong style={{ color: "var(--white)" }}>Full Transparency</strong><br />
                  Real-time reporting so coaches, ADs, and boosters always know
                  exactly where the money stands.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how">
        <div className="section-inner">
          <p className="section-label">The Process</p>
          <h2 className="section-title">HOW IT WORKS</h2>
          <p className="section-sub">
            We keep it simple so coaches can focus on coaching, not admin.
          </p>
          <div className="steps-grid">
            <div className="step">
              <div className="step-num">01</div>
              <h3>APPLY</h3>
              <p>Fill out a short form telling us about your team, your sport, and your fundraising goals.</p>
            </div>
            <div className="step">
              <div className="step-num">02</div>
              <h3>WE BUILD</h3>
              <p>We create your branded fundraising page, merchandise shop, and sponsor outreach kit — all within 48 hours.</p>
            </div>
            <div className="step">
              <div className="step-num">03</div>
              <h3>YOU SHARE</h3>
              <p>Send the link to players, parents, the community, and sponsors. We provide templates that make it easy.</p>
            </div>
            <div className="step">
              <div className="step-num">04</div>
              <h3>GET PAID</h3>
              <p>Funds are deposited directly to your program's account on a regular schedule. Transparent and simple.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── EXAMPLE PAGE ── */}
      <section className="example-section" id="example">
        <div className="section-inner">
          <p className="section-label">Live Example</p>
          <h2 className="section-title">WHAT YOUR PAGE<br />WILL LOOK LIKE</h2>
          <p className="section-sub">
            Every team gets a clean, branded page that's easy to share and
            optimized for donations from phones.
          </p>
          <div className="example-card">
            <div className="example-banner">
              <div>
                <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", marginBottom: "0.25rem" }}>
                  MESA HIGH SCHOOL
                </div>
                <h3>VARSITY FOOTBALL 2025</h3>
              </div>
              <span>LIVE</span>
            </div>
            <div className="example-body">
              <div className="progress-label">
                <span>Goal: $10,000</span>
                <strong>$6,820 raised</strong>
              </div>
              <div className="progress-bar">
                <div className="progress-fill"></div>
              </div>
              <p style={{ fontSize: "0.9rem", color: "var(--gray)", marginBottom: "1.5rem", lineHeight: "1.6" }}>
                Help the Mesa High Varsity Football program purchase new equipment,
                uniforms, and cover travel costs for the 2025 season. Every dollar
                goes directly to the players.
              </p>
              <p style={{ fontSize: "0.8rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--gray)", marginBottom: "0.75rem" }}>
                Choose an amount
              </p>
              <div className="example-amounts">
                <button className="amount-btn">$25</button>
                <button className="amount-btn active">$50</button>
                <button className="amount-btn">$100</button>
                <button className="amount-btn">$250</button>
                <button className="amount-btn">Custom</button>
              </div>
              <button className="example-donate-btn">
                Donate $50 to Mesa High Football →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── SPONSORS ── */}
      <section className="sponsors-section" id="sponsors">
        <div className="section-inner">
          <p className="section-label">Local Business Sponsors</p>
          <h2 className="section-title">ARIZONA BUSINESSES<br />INVEST IN LOCAL TEAMS</h2>
          <p className="section-sub" style={{ margin: "0 auto" }}>
            We connect your program with sponsors who care about Arizona youth
            athletics. From family-owned restaurants to regional companies.
          </p>
          <div className="sponsor-logos">
            <div className="sponsor-logo">DESERT AUTO GROUP</div>
            <div className="sponsor-logo">VALLEY DENTAL CARE</div>
            <div className="sponsor-logo">ARIZONA ROOFING PRO</div>
            <div className="sponsor-logo">MESA FAMILY CHIRO</div>
            <div className="sponsor-logo">SUNBELT INSURANCE</div>
            <div className="sponsor-logo">CACTUS BREWING CO</div>
          </div>
          <p style={{ marginTop: "2.5rem", fontSize: "0.85rem", color: "var(--gray)" }}>
            Placeholder sponsors shown — your page will feature real local partners.
          </p>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section className="contact-section" id="contact">
        <div className="section-inner">
          <p className="section-label">Get Started</p>
          <h2 className="section-title" style={{ color: "var(--white)" }}>
            REQUEST A<br />FREE DEMO
          </h2>
          <p className="section-sub">
            No commitment. We'll show you exactly what your team's page would
            look like and answer every question.
          </p>
          <form className="contact-form">
            <div className="form-field">
              <label>First Name</label>
              <input type="text" placeholder="Coach Smith" />
            </div>
            <div className="form-field">
              <label>Last Name</label>
              <input type="text" placeholder="Jones" />
            </div>
            <div className="form-field">
              <label>School Name</label>
              <input type="text" placeholder="Mesa High School" />
            </div>
            <div className="form-field">
              <label>Sport / Program</label>
              <input type="text" placeholder="Varsity Football" />
            </div>
            <div className="form-field">
              <label>Email Address</label>
              <input type="email" placeholder="coach@school.edu" />
            </div>
            <div className="form-field">
              <label>Your Role</label>
              <select>
                <option value="">Select your role</option>
                <option>Athletic Director</option>
                <option>Head Coach</option>
                <option>Assistant Coach</option>
                <option>Booster Club Member</option>
                <option>Parent / Guardian</option>
              </select>
            </div>
            <div className="form-field full">
              <label>Tell us about your program</label>
              <textarea
                rows={4}
                placeholder="What sport do you coach? What are your biggest fundraising challenges this season?"
              />
            </div>
            <button type="submit" className="form-submit">
              Request My Free Demo →
            </button>
          </form>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <div className="footer-inner">
          <div className="footer-logo">
            ELITE LEVEL <span>FUNDRAISING</span>
          </div>
          <ul className="footer-links">
            <li><a href="#why">Why Us</a></li>
            <li><a href="#how">How It Works</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
          <p className="footer-copy">
            © 2025 Elite Level Fundraising · Arizona
          </p>
        </div>
      </footer>
    </>
  );
}
