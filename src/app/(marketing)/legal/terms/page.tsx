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
      summary="Our full Terms of Service are being finalized. By using this site or requesting a demo, you agree to be contacted about Elite Level Fundraising."
    />
  );
}
