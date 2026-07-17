import type { Metadata } from "next";
import { LinkButton } from "@/components/marketing/Button";

export const metadata: Metadata = {
  title: "Fundraising | Elite Level Fundraising",
  description:
    "How Elite Level Fundraising's fundraising tools work for coaches, athletes, parents, donors, and administrators — campaign setup, athlete pages, live leaderboards, and Stripe-secured payments.",
  alternates: { canonical: "/fundraising" },
  openGraph: {
    title: "Fundraising | Elite Level Fundraising",
    description: "Campaign setup, athlete pages, live leaderboards, and secure payments — explained for every role on the team.",
    type: "website",
  },
};

const PERSONAS = [
  {
    role: "Coaches",
    headline: "Set the campaign up once, then step back.",
    body: "A coach sets the goal, the deadline, and what the money is for. From there, athlete pages and the leaderboard do the day-to-day work — no manual tracking of who gave what.",
    points: [
      "One campaign page per team, built from your program's info",
      "Fund-use breakdown parents can see before they give",
      "Real-time campaign tracking instead of a running spreadsheet",
    ],
  },
  {
    role: "Athletes",
    headline: "A page of their own to share.",
    body: "Every athlete gets a personal fundraising page and a share link. Their spot on the leaderboard turns donations into visible team momentum, not a cold ask.",
    points: [
      "Personal share link, easy to send or post",
      "Live leaderboard ranking by amount raised",
      "No separate login to manage — added by the coach at setup",
    ],
  },
  {
    role: "Parents",
    headline: "See exactly where the campaign stands.",
    body: "Parents don't have to ask the coach how a campaign is going — the public page shows live progress, and giving takes one Stripe-secured payment, no account required.",
    points: [
      "Public progress visible any time",
      "Give directly, no account required",
      "Clear breakdown of what the funds support",
    ],
  },
  {
    role: "Donors",
    headline: "A simple, trustworthy way to give.",
    body: "Donors reach the campaign through an athlete's share link, see who they're supporting, and pay through Stripe — the same processor used by millions of businesses.",
    points: [
      "Stripe-secured checkout, card details never touch our servers",
      "Clear on who and what the donation supports",
      "A receipt, not a black hole",
    ],
  },
  {
    role: "Administrators",
    headline: "Visibility across every team, not just one.",
    body: "Athletic directors and booster leadership need to see how fundraising is going across the whole department, not chase down individual coaches for updates.",
    points: [
      "Campaign progress visible across every team's page",
      "Consistent reporting instead of five different formats",
      "Less time spent asking coaches for a status update",
    ],
  },
];

export default function FundraisingPage() {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <h1>Fundraising, explained for every role on the team</h1>
          <p>
            One campaign, one page, and a different view for everyone who touches it — coach,
            athlete, parent, donor, and administrator.
          </p>
        </div>
      </div>

      <div className="mk-section">
        <div className="mk-container-narrow">
          {PERSONAS.map((p, i) => (
            <div className="mk-persona-block" key={p.role} style={i % 2 === 1 ? { background: "var(--mk-paper-2)", marginLeft: "calc(-1 * var(--mk-space-8))", marginRight: "calc(-1 * var(--mk-space-8))", paddingLeft: "var(--mk-space-8)", paddingRight: "var(--mk-space-8)", borderRadius: "var(--mk-radius-md)" } : undefined}>
              <div className="mk-persona-grid">
                <div>
                  <span className="mk-eyebrow">{p.role}</span>
                  <h3>{p.headline}</h3>
                </div>
                <div>
                  <p style={{ color: "var(--mk-muted)", marginBottom: "var(--mk-space-4)" }}>{p.body}</p>
                  <ul className="mk-capability-list">
                    {p.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <section className="mk-section mk-cta-band">
        <div className="mk-container-narrow">
          <h2>See a campaign built around your sport.</h2>
          <p>No commitment. We&rsquo;ll walk through the platform using your program as the example.</p>
          <LinkButton href="/demo" size="lg">Book a Free Demo</LinkButton>
        </div>
      </section>
    </>
  );
}
