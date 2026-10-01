import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MARKETING_NAV_LINKS } from "@/components/marketing/MarketingNav";

// Wraps every route in this group — currently: /about, /communication,
// /contact, /demo, /faq, /fundraising, /pricing, /product, /sponsors,
// /why-elf, /legal/*, and /trust/* — in the shared marketing nav + footer.
// Does not affect "/", which renders MarketingPage directly (see
// src/app/page.tsx) — Next.js route groups can't share a URL with a
// top-level page.tsx, so Home wraps itself in MarketingShell too.
//
// Marketing header standardization: navVariant="dark" + the canonical
// MARKETING_NAV_LINKS give every route in this group the same approved
// logo/nav/Log-in/Get-Started treatment as the homepage's own overlay
// header, just as a solid near-black bar in normal document flow (no hero
// photo here) instead of transparent-over-photo. Because every page above
// shares this one layout, this is the single place that standardizes all
// of them at once — no per-page changes needed. footerVariant is
// deliberately left at its default (full Platform/Company/Trust Center
// footer) — unrelated to this change.
export default function MarketingGroupLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingShell navVariant="dark" navLinks={MARKETING_NAV_LINKS}>
      {children}
    </MarketingShell>
  );
}
