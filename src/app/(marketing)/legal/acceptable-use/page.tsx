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
      summary="Our full Acceptable Use Policy is being finalized."
    />
  );
}
