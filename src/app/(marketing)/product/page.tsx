import type { Metadata } from "next";
import Image from "next/image";
import { LinkButton } from "@/components/marketing/Button";
import { StoreBadges } from "@/components/marketing/StoreBadges";
import { TeamAppSimulator } from "@/components/marketing/demo/TeamAppSimulator";

// /product is the free ELF Team App page (the season walkthrough that used
// to live here moved, unchanged, to /how-it-works). Every feature listed
// exists in the production app; the simulator runs on fictional data in the
// visitor's browser only (see TeamAppSimulator.tsx).
//
// Layout and type follow the approved /fundraising direction (Variation A
// Inter headings, .mk-fhero hero, numbered .mk-fbenefit grid, 12px buttons).

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
      <section className="mk-fhero mk-phero" aria-labelledby="mk-phero-title">
        <div className="mk-container mk-fhero-grid">
          <div className="mk-fhero-copy">
            <span className="mk-free-pill">Free for every team &middot; No fundraiser required</span>
            <h1 id="mk-phero-title" className="mk-fhero-title">
              One team. One app.<br /> Everything connected.
            </h1>
            <span className="mk-fhero-rule" aria-hidden="true" />
            <p>
              Bring coaches, athletes and parents together with messaging, schedules, attendance and
              team updates &mdash; all in one free app.
            </p>
            <div className="mk-fhero-actions">
              <LinkButton href="#simulator" size="lg">Try the Interactive Demo</LinkButton>
              <a href="/demo" className="mk-fhero-link">Get your team set up <span aria-hidden="true">&rarr;</span></a>
            </div>
            <StoreBadges />
          </div>
          <figure className="mk-phero-shot">
            <div className="mk-phone-frame">
              {/* The real ELF Team App (Team Communications screen of the
                  Riverside sample program) — not a mock-up. */}
              <Image
                src="/marketing/communications.png"
                alt="The real ELF Team App: the Team Communications screen with coach announcements about practice and an away game"
                width={720}
                height={900}
                priority
                sizes="(max-width: 900px) 70vw, 320px"
              />
            </div>
            <figcaption className="mk-fhero-caption">The real ELF Team App. Riverside High School is a sample program.</figcaption>
          </figure>
        </div>
      </section>

      <section id="simulator" className="mk-home-section mk-home-alt mk-sim-section" aria-labelledby="mk-sim-title">
        <div className="mk-container">
          <div className="mk-home-head">
            <span className="mk-eyebrow">Interactive demo</span>
            <h2 id="mk-sim-title" className="mk-va-title">See how your team stays connected.</h2>
            <p>
              Pick a role and tap around. It runs on a fictional team, right in your browser &mdash;
              nothing is sent or saved.
            </p>
          </div>
          <TeamAppSimulator />
        </div>
      </section>

      <section className="mk-fbenefits mk-pfeatures" aria-labelledby="mk-app-features">
        <div className="mk-container">
          <div className="mk-fbenefits-head">
            <span className="mk-eyebrow">What&rsquo;s inside</span>
            <h2 id="mk-app-features" className="mk-fbenefits-title">Everything your team needs, in one place.</h2>
          </div>
          {/* Ten features: two even columns (five rows) on desktop,
              one column on tablets and phones — never a lone item on a last row. */}
          <ol className="mk-fbenefit-grid mk-fbenefit-grid-2">
            {FEATURES.map((f, i) => (
              <li key={f.title} className="mk-fbenefit">
                <span className="mk-fbenefit-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <span className="mk-fbenefit-rule" aria-hidden="true" />
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mk-section mk-cta-band mk-pclose" aria-labelledby="mk-app-close">
        <div className="mk-container-narrow">
          <span className="mk-eyebrow mk-eyebrow-on-dark">Free for every team</span>
          <h2 id="mk-app-close">Your team deserves a better way to stay connected.</h2>
          <p>
            The ELF Team App is free for every team &mdash; no fundraiser required. If your program
            decides to raise money, ELF Fundraising plugs right into the same app.
          </p>
          <div className="mk-final-actions">
            <LinkButton href="/demo" variant="yellow" size="lg">Get Started Free</LinkButton>
            <LinkButton href="/fundraising" variant="outline" size="lg" className="mk-btn-on-dark">Learn About ELF Fundraising</LinkButton>
          </div>
          <StoreBadges tone="light" className="mk-pclose-badges" />
        </div>
      </section>
    </>
  );
}
