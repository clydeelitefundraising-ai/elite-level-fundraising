import { Inter, Anton, Permanent_Marker } from "next/font/google";

// All three are self-hosted by Next.js at build time (no external request, no
// render-blocking @import), scoped to the marketing site only via the
// classNames applied in MarketingShell — the Team App does not use any of
// these fonts.

// Body / UI — highly legible for paragraphs, nav, buttons, forms. Unchanged.
export const marketingFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--mk-font",
  display: "swap",
});

// Display — bold condensed athletic face for major marketing headlines.
// Anton is a single-weight, single-file condensed grotesk (very small
// payload — no weight variants to load) with an editorial/urban-sports
// character rather than a collegiate-cheerleading cliché.
export const marketingDisplayFont = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--mk-font-display-family",
  display: "swap",
});

// Hand/marker — restrained accent face for short annotations only (never
// body copy or long UI text). Also a single weight, single file.
export const marketingHandFont = Permanent_Marker({
  subsets: ["latin"],
  weight: "400",
  variable: "--mk-font-hand-family",
  display: "swap",
});
