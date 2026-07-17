import type { Metadata } from "next";
import { PolicyPlaceholder } from "@/components/marketing/PolicyPlaceholder";

export const metadata: Metadata = {
  title: "Compliance | Trust Center | Elite Level Fundraising",
  description: "Where Elite Level Fundraising stands on school-data-related compliance today.",
  alternates: { canonical: "/trust/compliance" },
};

export default function CompliancePage() {
  return (
    <PolicyPlaceholder
      title="Compliance"
      summary="Because we work with schools, we know questions about FERPA and COPPA come up early. Here's an honest answer, not a checked box."
    >
      <h2>Where we are today</h2>
      <p>
        We have not completed a formal FERPA or COPPA compliance review, and we don&rsquo;t claim
        certification we don&rsquo;t have. We&rsquo;re documenting our data practices here as that review
        happens, rather than publishing claims ahead of it.
      </p>
      <h2>What we can tell you now</h2>
      <p>
        Athlete profile data is entered by coaches or account holders, not collected directly from
        minors through the marketing site. If your district or booster club has specific compliance
        requirements, email us and we&rsquo;ll work through them directly.
      </p>
    </PolicyPlaceholder>
  );
}
