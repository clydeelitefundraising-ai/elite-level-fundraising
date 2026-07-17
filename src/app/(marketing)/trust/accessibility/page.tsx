import type { Metadata } from "next";
import { PolicyPlaceholder } from "@/components/marketing/PolicyPlaceholder";

export const metadata: Metadata = {
  title: "Accessibility | Trust Center | Elite Level Fundraising",
  description: "Our accessibility target and current state for the Elite Level Fundraising marketing site.",
  alternates: { canonical: "/trust/accessibility" },
};

export default function AccessibilityPage() {
  return (
    <PolicyPlaceholder
      title="Accessibility"
      summary="Our target is WCAG 2.2 Level AA across the public marketing site. Here's where that stands today."
    >
      <h2>What&rsquo;s in place</h2>
      <p>
        The public site is built with semantic landmarks, a logical heading structure, visible
        keyboard focus states, a skip-to-content link, an accessible mobile menu, and labeled form
        fields with inline error messages. Motion respects your system&rsquo;s reduced-motion
        preference.
      </p>
      <h2>What&rsquo;s still in progress</h2>
      <p>
        We have not yet completed a full third-party audit or automated conformance testing across
        every page. We&rsquo;re treating this as ongoing work, not a one-time checklist.
      </p>
      <h2>Reporting an issue</h2>
      <p>
        If you run into an accessibility barrier anywhere on this site, email{" "}
        <a href="mailto:support@elitelevelfundraising.com">support@elitelevelfundraising.com</a> and
        we&rsquo;ll prioritize a fix.
      </p>
    </PolicyPlaceholder>
  );
}
