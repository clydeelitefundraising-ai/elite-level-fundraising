import type { Metadata } from "next";
import { FundraisingHero, FundraisingBenefits } from "@/components/marketing/fundraising/FundraisingTop";

// TEMPORARY review page: three typography options for the two /fundraising
// headlines, side by side with otherwise identical sections (same
// components as the live page). Only the two headlines differ — see the
// .mk-typo-* rules in marketing-product.css. Every option uses Inter, the
// sans-serif the site already loads; no new fonts or dependencies.
// Remove once a direction is chosen.
export const metadata: Metadata = {
  title: "Fundraising typography options (review) | Elite Level Fundraising",
  robots: { index: false, follow: false },
};

const VARIANTS = [
  {
    key: "a",
    name: "Variation A — Modern Athletic",
    spec: "Inter 700 · sentence case · tight tracking (−0.04em). Inter Tight is Inter with tighter default spacing, so this is a close match.",
  },
  {
    key: "b",
    name: "Variation B — Premium Editorial",
    spec: "Inter 600 · sentence case · gentle tracking (−0.025em) · slightly smaller. Stands in for Manrope 500–600 (not loaded in the project).",
  },
  {
    key: "c",
    name: "Variation C — Bold Performance",
    spec: "Inter 700 · uppercase, not condensed · neutral tracking. Stands in for DM Sans 700 (not loaded in the project).",
  },
];

export default function FundraisingTypographyReview() {
  return (
    <>
      {VARIANTS.map((v) => (
        <div key={v.key} className={`mk-typo mk-typo-${v.key}`} id={`variation-${v.key}`}>
          <div className="mk-typo-label">
            <div className="mk-container">
              <strong>{v.name}</strong>
              <span>{v.spec}</span>
            </div>
          </div>
          <FundraisingHero idSuffix={`-${v.key}`} headingLevel={2} />
          <FundraisingBenefits idSuffix={`-${v.key}`} />
        </div>
      ))}
    </>
  );
}
