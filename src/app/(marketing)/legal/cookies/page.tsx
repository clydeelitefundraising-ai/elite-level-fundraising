import type { Metadata } from "next";
import { PolicyPlaceholder } from "@/components/marketing/PolicyPlaceholder";

export const metadata: Metadata = {
  title: "Cookie Policy | Elite Level Fundraising",
  description: "How Elite Level Fundraising uses cookies on its marketing site.",
  alternates: { canonical: "/legal/cookies" },
};

export default function CookiesPage() {
  return (
    <PolicyPlaceholder
      title="Cookie Policy"
      summary="Our full Cookie Policy is being finalized."
    >
      <p>
        The marketing site does not currently set any analytics or advertising cookies. This page
        will be updated with a full policy if and when that changes.
      </p>
    </PolicyPlaceholder>
  );
}
