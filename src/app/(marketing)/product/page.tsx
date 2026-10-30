import type { Metadata } from "next";
import { LinkButton } from "@/components/marketing/Button";
import { StoreBadges } from "@/components/marketing/StoreBadges";
import { TeamAppSimulator } from "@/components/marketing/demo/TeamAppSimulator";

// /product is the free ELF Team App page (the season walkthrough that used
// to live here moved, unchanged, to /how-it-works). Every feature listed
// exists in the production app; the simulator runs on fictional data in the
// visitor's browser only (see TeamAppSimulator.tsx).

export const metadata: Metadata = {
  title: "The Free ELF Team App | Elite Level Fundraising",
  description:
    "The free ELF Team App for coaches, athletes and parents: announcements, direct messages, calendar, attendance and roster — free for every team, no fundraiser required. Try the interactive demo.",
  alternates: { canonical: "/product" },
  openGraph: {
    title: "The Free ELF Team App",
    description: "Announcements, messages, calendar, attendance and roster for your whole program — free for every team.",
    type: "website",
  },
};

const FEATURES = [
  { title: "Team announcements", copy: "Post to the whole team, or target parents, athletes or a specific group. Team members can comment." },
  { title: "Direct messages", copy: "Coaches, athletes and parents message each other inside the app instead of personal phone numbers." },
  { title: "Parents included", copy: "When a coach messages an athlete, the athlete's parent or guardian is included automatically." },
  { title: "Head coach oversight", copy: "Conversations between staff and athletes stay visible to the head coach, by design." },
  { title: "Calendar and events", copy: "Practices, games and meetings in one team calendar that families can subscribe to on their phones." },
  { title: "Attendance", copy: "Coaches take attendance in a few taps, with a reason for each absence, and athletes can report absences ahead of time." },
  { title: "Roster and team management", copy: "One shared roster. Parents and athletes join with a team code — no spreadsheet of logins." },
  { title: "Multiple teams, one account", copy: "Coach two sports or have kids on two teams? Switch between teams from a single account." },
  { title: "Fundraising when you want it", copy: "Teams that choose to fundraise get athlete pages, share links and a live leaderboard, built in." },
  { title: "Notifications and permissions", copy: "Push notifications with per-person settings, and each role sees what it should — coach, athlete or parent." },
];

export default function TeamAppPage() {
  return (
    <>
      <div className="mk-page-hero mk-product-hero mk-app-hero">
        <div className="mk-container mk-product-hero-grid">
          <div>
            <span className="mk-free-pill">Free for every team &middot; No fundraiser required</span>
            <h1 className="mk-display">
              The free Team App built for your <span className="mk-marker-underline">entire program.</span>
            </h1>
            <p>
              Announcements, messages, calendar, attendance and roster for coaches, athletes and
              parents &mdash; in one app. The ELF Team App is free for every team, whether or not you
              run a fundraiser.
            </p>
            <div className="mk-offer-actions">
              <LinkButton href="#simulator" size="lg">Try the Interactive Demo</LinkButton>
              <a href="/demo" className="mk-text-link">Get your team set up &rarr;</a>
            </div>
            <StoreBadges />
          </div>
          <ul className="mk-app-hero-points" aria-label="Who it's for">
            <li><strong>Coaches</strong><span>Run the team from one place.</span></li>
            <li><strong>Athletes</strong><span>Know what&rsquo;s next, every day.</span></li>
            <li><strong>Parents</strong><span>Stay in the loop, without group-text chaos.</span></li>
          </ul>
        </div>
      </div>

      <section id="simulator" className="mk-home-section mk-home-alt mk-sim-section" aria-labelledby="mk-sim-title">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">Interactive demo</span>
            <h2 id="mk-sim-title" className="mk-display mk-home-title">Try the app as a coach, athlete or parent.</h2>
            <p>
              Pick a role and tap around. It runs on a fictional team, right in your browser &mdash;
              nothing is sent or saved.
            </p>
          </div>
          <TeamAppSimulator />
        </div>
      </section>

      <section className="mk-home-section" aria-labelledby="mk-app-features">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">What&rsquo;s inside</span>
            <h2 id="mk-app-features" className="mk-display mk-home-title">Everything your team runs on.</h2>
          </div>
          <ul className="mk-benefit-grid">
            {FEATURES.map((f) => (
              <li key={f.title} className="mk-benefit">
                <h3>{f.title}</h3>
                <p>{f.copy}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mk-home-section mk-home-partners" aria-labelledby="mk-app-free">
        <div className="mk-container mk-partners-band">
          <div>
            <span className="mk-eyebrow mk-eyebrow-on-dark">Free for every team</span>
            <h2 id="mk-app-free" className="mk-home-title-sm">No fundraiser required. Really.</h2>
            <p>
              Any team can use the ELF Team App for free. If your program decides to raise money,
              ELF Fundraising plugs right into the same app &mdash; but it&rsquo;s never a condition
              of using it.
            </p>
          </div>
          <div className="mk-partners-actions">
            <StoreBadges tone="light" />
            <a href="/fundraising" className="mk-text-link mk-text-link-on-dark">Learn about ELF Fundraising &rarr;</a>
          </div>
        </div>
      </section>

      <section className="mk-section mk-cta-band">
        <div className="mk-container-narrow">
          <h2>Get your team on the free ELF Team App.</h2>
          <p>We&rsquo;ll set up your team page, coach account and roster, then help you invite your families.</p>
          <div className="mk-final-actions">
            <LinkButton href="/demo" variant="yellow" size="lg">Get Started Free</LinkButton>
            <LinkButton href="/how-it-works" variant="outline" size="lg" className="mk-btn-on-dark">See How ELF Works</LinkButton>
          </div>
        </div>
      </section>
    </>
  );
}
