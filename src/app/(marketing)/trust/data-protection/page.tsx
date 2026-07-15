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
      summary="A summary of where data goes today. Formal retention schedules and a full data-processing agreement are still being finalized."
    >
      <h2>Sub-processors we use</h2>
      <p>Supabase (database hosting), Stripe (payment processing), Resend (transactional email), Vercel (application hosting).</p>
      <h2>Deletion requests</h2>
      <p>
        Email <a href="mailto:support@elitelevelfundraising.com">support@elitelevelfundraising.com</a> to
        request deletion of information you&rsquo;ve submitted through the marketing site.
      </p>
    </PolicyPlaceholder>
  );
}
