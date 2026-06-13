import "./homepage.css";
import Image from "next/image";

export default function MarketingPage() {
  return (
    <>
      {/* ── NAVIGATION ── */}
      <nav>
        <div className="nav-logo">
          <Image src="/ELF.LOGO.png" alt="Elite Level Fundraising logo" height={54} width={54} style={{ width: "auto", height: "54px" }} />
          ELITE LEVEL <span>FUNDRAISING</span>
        </div>
        <ul className="nav-links">
          <li><a href="#why">Why Us</a></li>
          <li><a href="#how">How It Works</a></li>
          <li><a href="#sponsors">Sponsors</a></li>
          <li><a href="#contact" className="nav-cta">Get Started</a></li>
        </ul>
        <button className="hp-menu-btn" aria-label="Open menu">☰</button>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hp-hero-grid">

          {/* Left: headline + CTAs */}
          <div>
            <div className="hp-hero-tag">Arizona&rsquo;s Sports Fundraising Platform</div>
            <h1 className="hp-hero-headline">
              RAISE <em>MORE.</em><br />
              KEEP <em>MORE.</em><br />
              WIN MORE.
            </h1>
            <p className="hp-hero-sub">
              Arizona&rsquo;s premium sports fundraising platform. Local. Transparent.
              Zero overhead. Built for coaches, loved by parents, trusted by
              300+ programs statewide.
            </p>
            <div className="btn-group">
              <a href="#contact" className="btn-primary">Request a Free Demo →</a>
              <a href="#how" className="btn-secondary">See How It Works</a>
            </div>
          </div>

          {/* Right: hero photo */}
          <div className="hp-hero-photo-wrap">
            <img
              src="/az.school.sunset.png"
              alt="Arizona high school athletics"
              className="hp-hero-photo"
            />
          </div>

        </div>
      </section>

      {/* ── WHY / FEATURES ── */}
      <section className="hp-features-section" id="why">
        <div className="hp-features-header">
          <p className="elf-section-label">Why Elite Level</p>
          <h2 className="elf-section-title">EVERYTHING YOUR<br />PROGRAM NEEDS.</h2>
          <p className="elf-section-sub">
            Built for ADs, coaches, and booster clubs &mdash; not generic charity
            platforms. Every feature is designed for Arizona school athletics.
          </p>
        </div>
        <div className="hp-features-grid">
          <div className="hp-feature-card">
            <div className="hp-feature-icon">💰</div>
            <h3 className="hp-feature-title">KEEP MORE</h3>
            <p className="hp-feature-desc">Transparent pricing with no surprise platform fees. More of every dollar stays with your program &mdash; for athletes, gear, travel, and team needs.</p>
          </div>
          <div className="hp-feature-card">
            <div className="hp-feature-icon">🏈</div>
            <h3 className="hp-feature-title">ATHLETE PAGES</h3>
            <p className="hp-feature-desc">Every athlete gets a personal share link and live leaderboard ranking. Healthy competition drives more donations.</p>
          </div>
          <div className="hp-feature-card">
            <div className="hp-feature-icon">🔒</div>
            <h3 className="hp-feature-title">SECURE PAYMENTS</h3>
            <p className="hp-feature-desc">Stripe-powered, bank-grade security on every transaction. Parents and donors trust every dollar sent.</p>
          </div>
          <div className="hp-feature-card">
            <div className="hp-feature-icon">📊</div>
            <h3 className="hp-feature-title">LIVE DASHBOARD</h3>
            <p className="hp-feature-desc">Real-time campaign tracking for coaches and ADs. Know exactly who donated, how much, and when &mdash; always.</p>
          </div>
          <div className="hp-feature-card">
            <div className="hp-feature-icon">📍</div>
            <h3 className="hp-feature-title">ARIZONA LOCAL</h3>
            <p className="hp-feature-desc">Born here. Built for Arizona schools. We know your community, your AIA, and your season schedule.</p>
          </div>
          <div className="hp-feature-card">
            <div className="hp-feature-icon">🤝</div>
            <h3 className="hp-feature-title">SPONSOR TOOLS</h3>
            <p className="hp-feature-desc">Sell ad placements directly on your campaign page. We connect programs with local Arizona businesses ready to invest.</p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="hp-steps-section" id="how">
        <div className="hp-steps-inner">
          <p className="elf-section-label">The Process</p>
          <h2 className="elf-section-title">HOW IT WORKS</h2>
          <p className="elf-section-sub">
            We keep it simple so coaches can focus on coaching, not admin.
            From application to first donation in 48 hours.
          </p>
          <div className="hp-steps-grid">
            <div className="hp-step-card">
              <div className="hp-step-num">01</div>
              <h3 className="hp-step-title">APPLY</h3>
              <p className="hp-step-desc">Fill out a short form about your team, sport, and fundraising goals. Takes less than 5 minutes.</p>
            </div>
            <div className="hp-step-card">
              <div className="hp-step-num">02</div>
              <h3 className="hp-step-title">WE BUILD</h3>
              <p className="hp-step-desc">We create your branded page, add your athletes, and set up sponsor outreach &mdash; all within 48 hours.</p>
            </div>
            <div className="hp-step-card">
              <div className="hp-step-num">03</div>
              <h3 className="hp-step-title">YOU SHARE</h3>
              <p className="hp-step-desc">Send the link to players, parents, and your community. We provide share templates that make it effortless.</p>
            </div>
            <div className="hp-step-card">
              <div className="hp-step-num">04</div>
              <h3 className="hp-step-title">GET PAID</h3>
              <p className="hp-step-desc">Funds deposit directly to your program&rsquo;s account on a regular schedule. Transparent and simple.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── SPONSORS ── */}
      <section className="hp-sponsors-section" id="sponsors">
        <div className="elf-container">
          <p className="elf-section-label" style={{ justifyContent: "center" }}>Local Business Sponsors</p>
          <h2 className="elf-section-title" style={{ textAlign: "center", color: "var(--color-text-primary-dark)" }}>
            ARIZONA BUSINESSES<br />INVEST IN LOCAL TEAMS
          </h2>
          <p className="elf-section-sub" style={{ margin: "0 auto", textAlign: "center" }}>
            We connect your program with local sponsors who care about
            Arizona youth athletics. Real relationships. Real sponsorships.
          </p>
          <div className="hp-sponsor-grid">
            <div className="hp-sponsor-tile">DESERT AUTO GROUP</div>
            <div className="hp-sponsor-tile">VALLEY DENTAL CARE</div>
            <div className="hp-sponsor-tile">ARIZONA ROOFING PRO</div>
            <div className="hp-sponsor-tile">MESA FAMILY CHIRO</div>
            <div className="hp-sponsor-tile">SUNBELT INSURANCE</div>
            <div className="hp-sponsor-tile">CACTUS BREWING CO</div>
          </div>
          <div className="hp-sponsor-cta">
            <a href="#contact" className="elf-btn elf-btn-secondary">
              Become a Sponsor for Your Local Team →
            </a>
          </div>
          <p className="hp-sponsor-note">
            Placeholder sponsors shown &mdash; your campaign will feature real local Arizona partners.
          </p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="hp-cta-section">
        <div className="elf-container-md">
          <h2 className="hp-cta-headline">READY TO<br />RAISE MORE?</h2>
          <p className="hp-cta-sub">
            Join 312 Arizona programs. No contracts. No hidden fees.
            Free to start in under 10 minutes.
          </p>
          <div className="hp-cta-actions">
            <a href="#contact" className="elf-btn elf-btn-primary elf-btn-lg">
              Start Your Free Campaign →
            </a>
          </div>
          <div className="hp-cta-trust">
            <span>✓ Free to start</span>
            <span>✓ Setup in 10 minutes</span>
            <span>✓ Cancel anytime</span>
          </div>
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
            No commitment. We&rsquo;ll show you exactly what your team&rsquo;s page would
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
      <footer className="hp-footer">
        <div className="hp-footer-inner">
          <div className="hp-footer-grid">
            <div>
              <div className="hp-footer-logo">
                <Image src="/ELF.LOGO.png" alt="Elite Level Fundraising logo" height={46} width={46} style={{ width: "auto", height: "46px" }} />
                ELITE LEVEL <span>FUNDRAISING</span>
              </div>
              <p className="hp-footer-tagline">
                Arizona&rsquo;s premier sports fundraising platform. Built for coaches.
                Trusted by programs statewide.
              </p>
              <div className="hp-footer-az-badge">🌵 Built in Arizona</div>
            </div>
            <div>
              <div className="hp-footer-col-title">Platform</div>
              <ul className="hp-footer-links">
                <li><a href="#how">How It Works</a></li>
                <li><a href="#why">Features</a></li>
                <li><a href="#sponsors">Sponsors</a></li>
                <li><a href="#contact">Get Started</a></li>
              </ul>
            </div>
            <div>
              <div className="hp-footer-col-title">Company</div>
              <ul className="hp-footer-links">
                <li><a href="#why">About</a></li>
                <li><a href="#contact">Contact</a></li>
                <li><a href="#contact">Arizona</a></li>
              </ul>
            </div>
            <div>
              <div className="hp-footer-col-title">Programs</div>
              <ul className="hp-footer-links">
                <li><a href="#contact">Football</a></li>
                <li><a href="#contact">Basketball</a></li>
                <li><a href="#contact">Track &amp; Field</a></li>
                <li><a href="#contact">All Sports</a></li>
              </ul>
            </div>
          </div>
          <div className="hp-footer-bottom">
            <p className="hp-footer-copy">© 2026 Elite Level Fundraising &middot; Phoenix, Arizona</p>
            <ul className="hp-footer-bottom-links">
              <li><a href="#contact">Privacy</a></li>
              <li><a href="#contact">Terms</a></li>
              <li><a href="#contact">Contact</a></li>
            </ul>
          </div>
        </div>
      </footer>
    </>
  );
}
