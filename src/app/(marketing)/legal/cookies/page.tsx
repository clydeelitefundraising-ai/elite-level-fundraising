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
      summary="How Elite Level Fundraising LLC uses cookies on this site."
    >
      <p>
        The marketing site does not currently set any analytics or advertising cookies. This page
        will be updated if that changes.
      </p>
    </PolicyPlaceholder>
  );
}
