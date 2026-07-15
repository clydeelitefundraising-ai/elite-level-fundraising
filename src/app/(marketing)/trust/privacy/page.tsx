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
      summary="Our full Privacy Policy is being finalized. Here is a plain-language summary of what we collect today and why."
    >
      <h2>What we collect</h2>
      <p>
        When you request a demo, we collect your name, school or organization, role, email
        address, and anything you write in the optional message field. We use this only to follow
        up about your request.
      </p>
      <h2>Where it&rsquo;s stored</h2>
      <p>
        Submissions are stored in our Supabase database and are not shared with third parties for
        marketing purposes.
      </p>
      <h2>Third-party services</h2>
      <p>
        We use Stripe to process donations, Resend to send email, and Supabase to store data.
        Each of these providers processes data on our behalf under their own privacy and security
        terms.
      </p>
      <h2>Your rights</h2>
      <p>
        To request that we delete information you&rsquo;ve submitted, email{" "}
        <a href="mailto:support@elitelevelfundraising.com">support@elitelevelfundraising.com</a>.
      </p>
    </PolicyPlaceholder>
  );
}
