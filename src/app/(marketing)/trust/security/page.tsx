import type { Metadata } from "next";
import { PolicyPlaceholder } from "@/components/marketing/PolicyPlaceholder";

export const metadata: Metadata = {
  title: "Security | Trust Center | Elite Level Fundraising",
  description: "How Elite Level Fundraising handles payment and platform security.",
  alternates: { canonical: "/trust/security" },
};

export default function SecurityPage() {
  return (
    <PolicyPlaceholder
      title="Security"
      summary="A plain-language summary of how payments and platform access are secured today."
    >
      <h2>Payments</h2>
      <p>
        All donations are processed by Stripe, a PCI-compliant payment processor used by millions
        of businesses. Elite Level Fundraising never receives or stores full card numbers.
      </p>
      <h2>Infrastructure</h2>
      <p>
        The platform runs on Supabase (database) and Vercel (hosting), and sends transactional
        email through Resend. All traffic to the site is served over HTTPS.
      </p>
      <h2>Access</h2>
      <p>
        Coach, admin, and account access is protected by hashed, salted passwords. We do not store
        plaintext passwords.
      </p>
    </PolicyPlaceholder>
  );
}
