import { Anton } from "next/font/google";

// Phase A35 — auth/entry visual refresh (login, teams, forgot/reset password).
// Mirrors the exact self-hosting pattern already used by the marketing site
// (src/components/marketing/fonts.ts) so the "welcoming ELF brand
// expression" entry experience sits on the same typographic family as the
// marketing site's "strongest brand expression" without importing any
// marketing-scoped file — this is its own independent font load, scoped via
// this variable className to only the auth views that import it. The Team
// App itself (calmer, utility-first) does not load this font.
export const authDisplayFont = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--auth-font-display",
  display: "swap",
});
