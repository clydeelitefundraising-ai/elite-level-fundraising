import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing/MarketingShell";

// Wraps every route in this group (/demo, /trust/*, /legal/*) in the shared
// marketing nav + footer. Does not affect "/", which renders MarketingPage
// directly (see src/app/page.tsx) — Next.js route groups can't share a URL
// with a top-level page.tsx, so Home wraps itself in MarketingShell too.
export default function MarketingGroupLayout({ children }: { children: ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
