import type { Metadata } from "next";
import { PolicyPlaceholder } from "@/components/marketing/PolicyPlaceholder";

export const metadata: Metadata = {
  title: "Data Protection | Trust Center | Elite Level Fundraising",
  description: "What Elite Level Fundraising collects, where it's processed, and how to request deletion.",
  alternates: { canonical: "/trust/data-protection" },
};

export default function DataProtectionPage() {
  return (
    <PolicyPlaceholder
      title="Data Protection"
      summary="A summary of where your data goes today and how to request deletion."
    >
      <h2>Sub-processors we use</h2>
      <p>Supabase (database hosting), Stripe (payment processing), Resend (transactional email), Vercel (application hosting).</p>
      <h2>Deletion requests</h2>
      <p>
        Email <a href="mailto:privacy@elitelevelfundraising.com">privacy@elitelevelfundraising.com</a> to
        request deletion of information you&rsquo;ve submitted through the marketing site.
      </p>
      <h2>Data-processing agreements</h2>
      <p>
        If your school or district needs a formal data-processing agreement for procurement,
        email <a href="mailto:privacy@elitelevelfundraising.com">privacy@elitelevelfundraising.com</a> and
        we&rsquo;ll work through it directly.
      </p>
    </PolicyPlaceholder>
  );
}
