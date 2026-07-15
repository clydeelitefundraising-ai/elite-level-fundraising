import type { Metadata } from "next";
import { LinkButton } from "@/components/marketing/Button";

export const metadata: Metadata = {
  title: "About | Elite Level Fundraising",
  description:
    "Why Elite Level Fundraising was built: too many athletic programs run on disconnected tools, and a coach-first, Arizona-rooted platform built to fix that.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About | Elite Level Fundraising",
    description: "The problem ELF is built to solve, and the philosophy behind it.",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <h1>About Elite Level Fundraising</h1>
          <p>Built in Phoenix, for the coaches actually running these programs.</p>
        </div>
      </div>

      <div className="mk-section">
        <div className="mk-container-narrow mk-prose">
          <h2>The problem we set out to fix</h2>
          <p>
            Athletic programs don&rsquo;t run on one tool &mdash; they run on a fundraising app for
            donations, a group text for parents, a spreadsheet for the roster, and a separate
            inbox for sponsors. None of it talks to any of the rest, and the coach is the one
            holding it all together, usually on their own time.
          </p>
          <p>
            Elite Level Fundraising exists because that gap was worth closing: one platform for
            fundraising, communication, team organization, and sponsor relationships, instead of a
            different tool for each.
          </p>

          <h2>Coach-first, not fundraising-first</h2>
          <p>
            Fundraising is where the platform started, but it isn&rsquo;t the whole product.
            Every feature is built around what actually makes a coach&rsquo;s season easier &mdash;
            not around what looks good in a feature list. That means athlete pages that are simple
            to share, a team hub that replaces the group text instead of adding to it, and sponsor
            tracking that doesn&rsquo;t rely on one person&rsquo;s memory.
          </p>

          <h2>Arizona roots</h2>
          <p>
            We&rsquo;re headquartered in Phoenix and currently focused on Arizona schools. The
            platform is built to support athletic programs nationwide as we grow, without ever
            locking the product to one state&rsquo;s rules or season calendar.
          </p>

          <h2>Where this is headed</h2>
          <p>
            The long-term goal is straightforward: give every athletic program &mdash; not just
            the ones with a full-time administrative staff &mdash; a single, well-built system for
            the things that currently take a dozen disconnected tools to do badly.
          </p>
        </div>
      </div>

      <section className="mk-section mk-cta-band">
        <div className="mk-container-narrow">
          <h2>See what that looks like for your program.</h2>
          <p>No commitment. We&rsquo;ll walk through the platform using your sport as the example.</p>
          <LinkButton href="/demo" size="lg">Book a Free Demo</LinkButton>
        </div>
      </section>
    </>
  );
}
