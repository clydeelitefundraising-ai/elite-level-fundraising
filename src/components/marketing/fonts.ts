import { Inter } from "next/font/google";

// Self-hosted by Next.js at build time (no external request, no render-blocking
// @import). Scoped to the marketing site only via the className applied in
// MarketingShell — the Team App does not use this font.
export const marketingFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--mk-font",
  display: "swap",
});
