import { Anton, Kalam } from "next/font/google";

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

// Phase A36 — restrained handwritten/marker accent, for short personality
// statements only (never functional labels, buttons, inputs, or validation
// text — see authEntry.module.css's .handwritten class doc comment). Same
// face (Kalam, bold) the marketing site already uses for its own hand
// annotations (marketingHandFont in marketing/fonts.ts) — reused here via
// an independent auth-scoped next/font/google load rather than importing
// the marketing-scoped file, consistent with this file's existing
// independence convention.
export const authHandFont = Kalam({
  subsets: ["latin"],
  weight: "700",
  variable: "--auth-font-hand",
  display: "swap",
});
