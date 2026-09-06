import { Inter, Anton, Bangers, Kalam } from "next/font/google";

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
// body copy or long UI text). Single weight, single file.
//
// Mockup-fidelity pass: compared Permanent Marker (previous choice) against
// the mockup's actual handwritten annotations ("Same grind. Bigger
// opportunities.", "Big things start locally.") via a side-by-side render —
// the mockup's script is lighter and more cursive-connected than Permanent
// Marker's uniform blocky strokes. Kalam (bold weight) was the closest real
// match: casual pen-stroke variation, still bold enough to read clearly at
// small sizes, no licensing risk (OFL, self-hosted via next/font/google).
export const marketingHandFont = Kalam({
  subsets: ["latin"],
  weight: "700",
  variable: "--mk-font-hand-family",
  display: "swap",
});

// Hero-only display face — homepage hero headline exclusively. Anton (the
// site's default display face, kept below for every OTHER headline) is
// clean/geometric; the mockup's "FUND THE SEASON." has a rough, italicized,
// brush/poster character Anton doesn't reproduce. Compared Anton, Bangers,
// Rubik Distressed, Passion One Black, Titan One, Luckiest Guy, Rubik Wet
// Paint, and Rubik Beastly side-by-side against the mockup crop (see Phase 6
// report). None is a literal match — the mockup's dry-brush diagonal
// texture likely isn't a real installable typeface — but Bangers is the
// closest legitimate match on shape: condensed, forward-slanted, bold,
// energetic, and (unlike the more "distressed/textured" candidates) still
// fully legible as live/selectable text at hero size. No added CSS texture
// filter: turbulence/displacement filters on a hero-sized headline risked
// performance and cross-browser rendering inconsistency for a marginal gain
// per the "only if it stays performant and readable" instruction.
export const marketingHeroFont = Bangers({
  subsets: ["latin"],
  weight: "400",
  variable: "--mk-font-hero-family",
  display: "swap",
});
