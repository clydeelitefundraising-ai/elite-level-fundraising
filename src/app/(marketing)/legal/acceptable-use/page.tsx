import type { Metadata } from "next";
import { PolicyPlaceholder } from "@/components/marketing/PolicyPlaceholder";

export const metadata: Metadata = {
  title: "Acceptable Use Policy | Elite Level Fundraising",
  description: "Acceptable use guidelines for the Elite Level Fundraising platform.",
  alternates: { canonical: "/legal/acceptable-use" },
};

export default function AcceptableUsePage() {
  return (
    <PolicyPlaceholder
      title="Acceptable Use Policy"
      summary="Guidelines for using the Elite Level Fundraising LLC platform and website."
    >
      <p>
        The Elite Level Fundraising platform is intended for legitimate school and athletic
        program fundraising, communication, and reporting activity. When using it, don&rsquo;t:
      </p>
      <ul>
        <li>Send spam, phishing attempts, or unsolicited bulk messages through the platform</li>
        <li>Attempt to access accounts, teams, or data that aren&rsquo;t yours</li>
        <li>Interfere with or disrupt the platform&rsquo;s infrastructure or security</li>
        <li>Use the platform to collect payments for anything other than legitimate program fundraising</li>
      </ul>
      <p>
        We may suspend or terminate access for accounts that violate this policy.
      </p>
    </PolicyPlaceholder>
  );
}
