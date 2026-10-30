import type { Metadata } from "next";
import Link from "next/link";
import { teamAppLoginUrl } from "@/lib/teamAppLogin";

// Public support page (no sign-in), suitable as the App Store / Google Play
// "Support URL". Every contact route and statement here already exists on
// the site: support@ (FAQ, System Status), privacy@ (Privacy Policy), info@
// (Contact), in-app account deletion (Settings → Account & Privacy). No new
// service, inbox or response-time promise is introduced.
export const metadata: Metadata = {
  title: "Support | Elite Level Fundraising",
  description:
    "Get help with the ELF Team App: signing in, your account, privacy and data requests, and where to find system status and policies.",
  alternates: { canonical: "/support" },
  openGraph: {
    title: "Support | Elite Level Fundraising",
    description: "Help with the ELF Team App, your account, and privacy or data requests.",
    type: "website",
  },
};

const LOGIN_URL = teamAppLoginUrl(process.env.NEXT_PUBLIC_ELF_DEPLOYMENT_MODE);
const FORGOT_PASSWORD_URL = LOGIN_URL.replace(/\/login$/, "/forgot-password");

export default function SupportPage() {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <span className="mk-eyebrow">Support</span>
          <h1>How can we help?</h1>
          <p>
            Help with the ELF Team App, your account, and privacy or data requests &mdash; and
            where to find our policies and system status.
          </p>
        </div>
      </div>

      <div className="mk-section">
        <div className="mk-container mk-contact-grid">
          <div className="mk-contact-card">
            <h2>Help with the Team App</h2>
            <p>
              Coaches, athletes, parents and boosters can email{" "}
              <a href="mailto:support@elitelevelfundraising.com">support@elitelevelfundraising.com</a>.
              A person who knows the product answers.
            </p>
            <p style={{ marginBottom: 0 }}>
              Something not working? Check <Link href="/trust/status">System Status</Link>, and
              email us if it looks wrong regardless of what&rsquo;s shown there.
            </p>
          </div>

          <div className="mk-contact-card">
            <h2>Signing in and passwords</h2>
            <p>
              Sign in to the Team App at <a href={LOGIN_URL}>the ELF Team App sign-in page</a>.
            </p>
            <p style={{ marginBottom: 0 }}>
              Forgot your password? Use <a href={FORGOT_PASSWORD_URL}>Reset your password</a> to
              get a reset link by email.
            </p>
          </div>

          <div className="mk-contact-card">
            <h2>Privacy and data requests</h2>
            <p>
              To request a copy of your data, or to ask us to delete information you&rsquo;ve
              submitted, email{" "}
              <a href="mailto:privacy@elitelevelfundraising.com">privacy@elitelevelfundraising.com</a>.
            </p>
            <p>
              Signed-in users can also delete their own account in the Team App: open{" "}
              <strong>Settings</strong>, then <strong>Account &amp; Privacy</strong>, then{" "}
              <strong>Delete Account</strong>.
            </p>
            <p style={{ marginBottom: 0 }}>
              See our <Link href="/trust/privacy">Privacy Policy</Link> for how we handle
              information.
            </p>
          </div>

          <div className="mk-contact-card">
            <h2>Questions, demos and business contact</h2>
            <p>
              For general or sales questions, see <Link href="/contact">Contact</Link>. Formal
              business contact details are on <Link href="/trust/contact">Business Contact</Link>.
            </p>
            <p style={{ marginBottom: 0 }}>
              More resources: <Link href="/faq">FAQ</Link> &middot;{" "}
              <Link href="/trust">Trust Center</Link> &middot;{" "}
              <Link href="/legal/terms">Terms of Service</Link> &middot;{" "}
              <Link href="/legal/cookies">Cookie Policy</Link> &middot;{" "}
              <Link href="/trust/accessibility">Accessibility</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
