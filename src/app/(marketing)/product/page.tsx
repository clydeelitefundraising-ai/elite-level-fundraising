import type { Metadata } from "next";
import { LinkButton } from "@/components/marketing/Button";
import { ProductPreview } from "@/components/marketing/ProductPreview";

export const metadata: Metadata = {
  title: "Product | Elite Level Fundraising",
  description:
    "A guided walkthrough of how Elite Level Fundraising supports an athletic program from setup through reporting — fundraising, communication, sponsors, and team management in one platform.",
  alternates: { canonical: "/product" },
  openGraph: {
    title: "Product | Elite Level Fundraising",
    description: "How ELF supports an athletic program across the full season, stage by stage.",
    type: "website",
  },
};

const STAGES = [
  {
    id: "setup",
    num: "01",
    eyebrow: "Program setup",
    title: "Start with your program, not a blank template.",
    copy: "Tell us about your team, sport, and goals. We set up your branded page, add your coach account, and configure your team hub before you touch anything.",
    list: [
      "Branded team page, no design work required",
      "Coach account created and ready on day one",
      "Athletes and roster imported to start",
    ],
    preview: null,
  },
  {
    id: "campaign",
    num: "02",
    eyebrow: "Fundraising campaign creation",
    title: "Set a goal, and let the page do the asking.",
    copy: "A campaign goal, a deadline, and a clear breakdown of what the funds are for — published as a single page you can share anywhere.",
    list: [
      "Goal amount and season deadline",
      "Fund-use breakdown parents can see",
      "One shareable campaign page per team",
    ],
    preview: (
      <ProductPreview
        label="Live campaign page"
        image={{ src: "/marketing/campaign-hero.png", alt: "A real Elite Level Fundraising campaign page for a demo football program, showing the goal, days left, and donor count", width: 1440, height: 620 }}
        demoNote="Demo data — Riverside High School is a sample program, not a real customer."
      />
    ),
  },
  {
    id: "participation",
    num: "03",
    eyebrow: "Athlete & parent participation",
    title: "Every athlete gets their own page to share.",
    copy: "Athletes get a personal fundraising page and share link. Parents and boosters join with a code — no separate accounts to manage by hand.",
    list: [
      "Personal athlete share links",
      "Simple join-code flow for parents and boosters",
      "No spreadsheet of usernames and passwords",
    ],
    preview: null,
  },
  {
    id: "donations",
    num: "04",
    eyebrow: "Donations & live progress",
    title: "Donations feel like momentum, not a cold ask.",
    copy: "Every gift runs through Stripe and shows up on a live leaderboard in real time, so the whole team can see the campaign move.",
    list: [
      "Stripe-secured checkout, no card data touches our servers",
      "Live leaderboard by athlete",
      "Real-time progress toward the campaign goal",
    ],
    preview: (
      <ProductPreview
        label="Athlete leaderboard"
        image={{ src: "/marketing/leaderboard.png", alt: "Real athlete leaderboard and donation form from a demo Elite Level Fundraising campaign page, ranked by amount raised", width: 1002, height: 660 }}
        demoNote="Demo data — Riverside High School is a sample program, not a real customer."
      />
    ),
  },
  {
    id: "communication",
    num: "05",
    eyebrow: "Communication & announcements",
    title: "One thread the whole team already checks.",
    copy: "Announcements and direct messages live in the same hub as the campaign — the place coaches and parents are already looking for donation updates.",
    list: [
      "Team-wide announcements",
      "Direct messages between coaches, parents, and athletes",
      "Push notifications, so nothing gets missed in a group text",
    ],
    preview: (
      <ProductPreview
        label="Team communications"
        image={{ src: "/marketing/communications.png", alt: "Real Team Communications view in the Elite Level Fundraising Team App, showing coach announcements about practice and an away game", width: 720, height: 900 }}
      />
    ),
  },
  {
    id: "sponsors",
    num: "06",
    eyebrow: "Sponsor management",
    title: "Sponsor relationships that live in one place.",
    copy: "Track every sponsor conversation instead of relying on memory, and place sponsor logos directly on your campaign page.",
    list: [
      "Sponsor CRM with activity history and renewal tracking",
      "Sponsor logos on the public campaign page",
      "Nothing depends on one person's inbox",
    ],
    preview: (
      <ProductPreview
        label="Sponsor placement"
        image={{ src: "/marketing/sponsors.png", alt: "Real sponsor tier display on a demo Elite Level Fundraising campaign page, showing gold, silver, and bronze sponsor placements", width: 1000, height: 624 }}
      />
    ),
  },
  {
    id: "team",
    num: "07",
    eyebrow: "Team organization",
    title: "A roster and calendar that stay current.",
    copy: "Roster, class year, and contact info live in one shared record — along with a team calendar and an optional team shop.",
    list: [
      "Shared roster, not five different copies",
      "Team calendar for practices, games, and deadlines",
      "Optional team shop for gear",
    ],
    preview: null,
  },
  {
    id: "reporting",
    num: "08",
    eyebrow: "Reporting & administration",
    title: "Coaches and ADs always know where things stand.",
    copy: "Campaign progress, participation, and sponsor status roll up into reporting built for the people who have to answer for it — coaches, athletic directors, and booster leadership.",
    list: [
      "Campaign-level progress reporting",
      "Participation visibility across the roster",
      "Built for the questions ADs and boosters actually ask",
    ],
    preview: null,
  },
  {
    id: "multi-team",
    num: "09",
    eyebrow: "Multi-team support",
    title: "Coach two sports? Have a kid on two teams? One account.",
    copy: "Coaches, parents, and athletes who touch more than one team switch between them from a single account instead of juggling logins.",
    list: [
      "One account, multiple teams",
      "A team switcher instead of separate logins",
      "Built for programs where roles overlap across sports",
    ],
    preview: (
      <ProductPreview label="Your Teams">
        <div className="mk-pipeline">
          <div className="mk-pipeline-row">
            <span className="mk-pipeline-name">Varsity Football</span>
            <span className="mk-pipeline-status mk-pipeline-status-active">Head Coach</span>
          </div>
          <div className="mk-pipeline-row">
            <span className="mk-pipeline-name">Track &amp; Field</span>
            <span className="mk-pipeline-status mk-pipeline-status-prospect">Assistant Coach</span>
          </div>
        </div>
      </ProductPreview>
    ),
  },
];

export default function ProductPage() {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <h1>How Elite Level Fundraising works</h1>
          <p>
            One platform, from the first setup call to the last donation of the season.
            Here&rsquo;s what actually happens at each stage.
          </p>
        </div>
      </div>

      {STAGES.map((s, i) => (
        <section
          className={`mk-section mk-capability ${i % 2 === 1 ? "mk-section-alt" : ""}`}
          id={s.id}
          key={s.id}
        >
          <div className={`mk-container ${s.preview ? "mk-capability-grid" : ""} ${i % 2 === 1 && s.preview ? "mk-reverse" : ""}`}>
            <div className="mk-capability-copy">
              <span className="mk-eyebrow">
                Stage {s.num} &middot; {s.eyebrow}
              </span>
              <h2 style={{ fontSize: "var(--mk-text-2xl)" }}>{s.title}</h2>
              <p style={{ color: "var(--mk-muted)", marginTop: "var(--mk-space-3)", maxWidth: s.preview ? undefined : "62ch" }}>
                {s.copy}
              </p>
              <ul className="mk-capability-list">
                {s.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            {s.preview}
          </div>
        </section>
      ))}

      <section className="mk-section mk-cta-band">
        <div className="mk-container-narrow">
          <h2>See your own program on this page.</h2>
          <p>No commitment. We&rsquo;ll walk through the platform using your sport as the example.</p>
          <LinkButton href="/demo" size="lg">Book a Free Demo</LinkButton>
        </div>
      </section>
    </>
  );
}
