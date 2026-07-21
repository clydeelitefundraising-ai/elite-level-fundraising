import type { Metadata } from "next";
import { PolicyPlaceholder } from "@/components/marketing/PolicyPlaceholder";

export const metadata: Metadata = {
  title: "Terms of Service | Elite Level Fundraising",
  description: "Terms governing use of the Elite Level Fundraising website and platform.",
  alternates: { canonical: "/legal/terms" },
};

export default function TermsPage() {
  return (
    <PolicyPlaceholder
      title="Terms of Service"
      summary="Terms governing use of the Elite Level Fundraising website and the ELF Team App."
    >
      <h2>Marketing site</h2>
      <p>
        By using this site or requesting a demo, you agree to be contacted by Elite Level
        Fundraising LLC about your inquiry.
      </p>
      <h2>ELF Team App accounts</h2>
      <p>
        The ELF Team App is intended for coaches, athletes, parents/guardians, and boosters
        affiliated with a participating school athletic program. You&rsquo;re responsible for the
        accuracy of information you provide and for keeping your login credentials confidential.
        Accounts are provisioned by a coach or administrator, or created directly with a valid
        team join code.
      </p>
      <h2>Age eligibility</h2>
      <p>
        The Team App is designed for use by high school athletic program members. It is not
        directed at children under 13, and we ask that accounts not be created for anyone under
        that age. A parent/guardian or coach may manage an athlete&rsquo;s roster entry on their
        behalf instead.
      </p>
      <h2>Acceptable use</h2>
      <p>
        Messages, updates, and roster content shared through the app should relate to legitimate
        team activity. Harassment, impersonation, or sharing content unrelated to the team&rsquo;s
        program is not permitted. Contact{" "}
        <a href="mailto:support@elitelevelfundraising.com">support@elitelevelfundraising.com</a>{" "}
        to report a problem with another user or with content in the app.
      </p>
      <h2>Donations</h2>
      <p>
        Donations made through a campaign page are processed by Stripe. Donations are generally
        non-refundable except where required by law or at Elite Level Fundraising&rsquo;s
        discretion — contact us if you believe a donation was made in error.
      </p>
    </PolicyPlaceholder>
  );
}
