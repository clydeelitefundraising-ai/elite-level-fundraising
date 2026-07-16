import type { Metadata } from "next";
import { LinkButton } from "@/components/marketing/Button";
import { ProductPreview } from "@/components/marketing/ProductPreview";

export const metadata: Metadata = {
  title: "Communication | Elite Level Fundraising",
  description:
    "How Elite Level Fundraising replaces scattered group texts and spreadsheets — announcements, direct messages, push notifications, and multi-team access in one hub.",
  alternates: { canonical: "/communication" },
  openGraph: {
    title: "Communication | Elite Level Fundraising",
    description: "Announcements, direct messages, and push notifications — in the same hub as the campaign, not a fourth app.",
    type: "website",
  },
};

export default function CommunicationPage() {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <h1>Communication that doesn&rsquo;t live in a group text</h1>
          <p>
            A group text has no record, no targeting, and no memory once someone gets a new phone.
            ELF keeps team communication in the same place as everything else.
          </p>
        </div>
      </div>

      <section className="mk-section mk-capability" id="announcements">
        <div className="mk-container mk-capability-grid">
          <div className="mk-capability-copy">
            <span className="mk-eyebrow">Announcements &amp; targeting</span>
            <h2 style={{ fontSize: "var(--mk-text-2xl)" }}>Say it once, to the right people.</h2>
            <p style={{ color: "var(--mk-muted)", marginTop: "var(--mk-space-3)" }}>
              Post an announcement to the whole team, or target it — parents only, athletes only,
              or a specific group — instead of a group text everyone has to scroll past.
            </p>
            <ul className="mk-capability-list">
              <li>Team-wide or targeted announcements</li>
              <li>A permanent record, not a thread that scrolls away</li>
              <li>Posted from the same hub as the fundraising campaign</li>
            </ul>
          </div>
          <ProductPreview
            label="Team communications"
            image={{ src: "/marketing/communications.png", alt: "Real Team Communications view in the Elite Level Fundraising Team App, showing coach announcements about practice and an away game", width: 720, height: 900 }}
          />
        </div>
      </section>

      <section className="mk-section mk-section-alt mk-capability" id="messages">
        <div className="mk-container mk-capability-grid mk-reverse">
          <div className="mk-capability-copy">
            <span className="mk-eyebrow">Direct messages</span>
            <h2 style={{ fontSize: "var(--mk-text-2xl)" }}>One-on-one, without leaving the platform.</h2>
            <p style={{ color: "var(--mk-muted)", marginTop: "var(--mk-space-3)" }}>
              Coaches, parents, and athletes can message directly when something doesn&rsquo;t need
              a full announcement &mdash; a question about a donation, a scheduling conflict, a
              quick check-in.
            </p>
            <ul className="mk-capability-list">
              <li>Direct messages between coaches, parents, and athletes</li>
              <li>Threaded, so context isn&rsquo;t lost</li>
              <li>No personal phone numbers required to reach a coach</li>
            </ul>
          </div>
          <ProductPreview label="Direct Message">
            <div className="mk-thread">
              <div className="mk-thread-msg">
                <span className="mk-thread-avatar">P</span>
                <div className="mk-thread-body">
                  <div className="mk-thread-meta"><span className="mk-thread-name">Parent</span><span className="mk-thread-time">1h ago</span></div>
                  <p className="mk-thread-text">Can Jordan make up the missed fundraiser deadline?</p>
                </div>
              </div>
              <div className="mk-thread-msg">
                <span className="mk-thread-avatar">C</span>
                <div className="mk-thread-body">
                  <div className="mk-thread-meta"><span className="mk-thread-name">Coach</span><span className="mk-thread-time">45m ago</span></div>
                  <p className="mk-thread-text">Yes &mdash; I&rsquo;ll extend it for him.</p>
                </div>
              </div>
            </div>
          </ProductPreview>
        </div>
      </section>

      <section className="mk-section mk-capability" id="notifications">
        <div className="mk-container mk-capability-grid">
          <div className="mk-capability-copy">
            <span className="mk-eyebrow">Push notifications &amp; read status</span>
            <h2 style={{ fontSize: "var(--mk-text-2xl)" }}>Know it was seen, not just sent.</h2>
            <p style={{ color: "var(--mk-muted)", marginTop: "var(--mk-space-3)" }}>
              Push notifications reach parents and athletes on web where supported, so an
              announcement doesn&rsquo;t just sit unread. Where read status is available, coaches
              can see it &mdash; not just hope for a reply.
            </p>
            <ul className="mk-capability-list">
              <li>Web push notifications for announcements and messages</li>
              <li>Read status where supported, visible to coaches</li>
              <li>No dependence on a group text everyone has muted</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mk-section mk-section-alt mk-capability" id="multi-team">
        <div className="mk-container mk-capability-grid mk-reverse">
          <div className="mk-capability-copy">
            <span className="mk-eyebrow">Multi-role &amp; multi-team access</span>
            <h2 style={{ fontSize: "var(--mk-text-2xl)" }}>Built for people who wear more than one hat.</h2>
            <p style={{ color: "var(--mk-muted)", marginTop: "var(--mk-space-3)" }}>
              A parent who&rsquo;s also a booster, or a coach who works two sports, doesn&rsquo;t need
              two logins. One account, switch between teams and roles as needed.
            </p>
            <ul className="mk-capability-list">
              <li>One account across multiple teams</li>
              <li>Role-appropriate access per team</li>
              <li>A team switcher instead of separate accounts</li>
            </ul>
          </div>
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
        </div>
      </section>

      <section className="mk-section mk-cta-band">
        <div className="mk-container-narrow">
          <h2>See the team hub in action.</h2>
          <p>No commitment. We&rsquo;ll walk through the platform using your sport as the example.</p>
          <LinkButton href="/demo" size="lg">Book a Free Demo</LinkButton>
        </div>
      </section>
    </>
  );
}
