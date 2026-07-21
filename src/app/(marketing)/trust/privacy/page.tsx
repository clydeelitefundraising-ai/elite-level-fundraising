import type { Metadata } from "next";
import { PolicyPlaceholder } from "@/components/marketing/PolicyPlaceholder";

export const metadata: Metadata = {
  title: "Privacy | Trust Center | Elite Level Fundraising",
  description: "A summary of what Elite Level Fundraising collects and how it's used.",
  alternates: { canonical: "/trust/privacy" },
};

export default function PrivacyPage() {
  return (
    <PolicyPlaceholder
      title="Privacy"
      summary="A plain-language summary of what Elite Level Fundraising LLC collects and why — covering both this website and the ELF Team App."
    >
      <h2>Marketing site (demo requests)</h2>
      <p>
        When you request a demo, we collect your name, school or organization, role, email
        address, and anything you write in the optional message field. We use this only to follow
        up about your request.
      </p>
      <h2>ELF Team App (coaches, parents, athletes, boosters)</h2>
      <p>
        Creating an account collects your name, email address, and a securely hashed password —
        we never store passwords in plain text. Depending on your role, the app may also hold:
      </p>
      <ul>
        <li>
          <strong>Athlete/roster information</strong> — name, grad class, sport/event, and an
          optional profile photo, entered by a coach or the athlete themselves.
        </li>
        <li>
          <strong>Messages and team updates</strong> — content sent through the app&rsquo;s
          Communications/Messages features is stored so conversations and announcements persist
          across sessions.
        </li>
        <li>
          <strong>Donation records</strong> — when someone donates to a campaign, we store the
          donor-provided name, amount, and message (if any). Card and payment details are handled
          entirely by Stripe; we never see or store full payment card numbers.
        </li>
        <li>
          <strong>Push notification tokens</strong> — if you opt in to notifications from a
          supported browser, we store the subscription endpoint needed to deliver them. You can
          revoke this at any time from the app.
        </li>
        <li>
          <strong>Usage/audit records</strong> — administrative actions (e.g. campaign changes,
          coach invitations) are logged for security and support purposes.
        </li>
      </ul>
      <h2>Where it&rsquo;s stored</h2>
      <p>
        All of the above is stored in our Supabase database and is not sold or shared with third
        parties for marketing purposes.
      </p>
      <h2>Third-party services</h2>
      <p>
        We use Stripe to process donations, Resend to send email, and Supabase to store data.
        Each of these providers processes data on our behalf under their own privacy and security
        terms.
      </p>
      <h2>Athletes and minors</h2>
      <p>
        The ELF Team App is built for high school athletic programs; most athlete users are
        teenagers, not young children. We do not knowingly collect personal information from
        children under 13. A parent or coach can request removal of an athlete&rsquo;s account or
        profile information at any time by contacting us below.
      </p>
      <h2>Your rights</h2>
      <p>
        To request a copy of your data, or to request that we delete information you&rsquo;ve
        submitted — on the marketing site or inside the Team App — email{" "}
        <a href="mailto:privacy@elitelevelfundraising.com">privacy@elitelevelfundraising.com</a>.
      </p>
    </PolicyPlaceholder>
  );
}
