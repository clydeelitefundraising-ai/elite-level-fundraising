// Phase O3 — shared inline-style objects for the three field components
// (SchoolField/SportField/SeasonField) and CreateTeamView itself. This repo
// has no component library/Tailwind (confirmed repeatedly across this
// engagement) — these are plain style objects, matching the established
// convention elsewhere (e.g. TeamBrandingSection.tsx's own local style
// constants), just centralized here since three near-identical field
// wrappers would otherwise copy-paste the same object three times.
import type { CSSProperties } from "react";

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: ".78rem",
  fontWeight: 700,
  color: "var(--text-primary-app, #121110)",
  marginBottom: ".35rem",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: ".75rem .9rem",
  borderRadius: ".7rem",
  border: "1.5px solid var(--border-app, #e5e7eb)",
  fontSize: ".95rem",
  color: "var(--text-primary-app, #121110)",
  background: "#fff",
  // Matches the existing mobile tap-target convention used elsewhere
  // (e.g. the /teams CTA buttons) — comfortably >=44px tall.
  minHeight: 46,
};

export const fieldErrorStyle: CSSProperties = {
  margin: ".35rem 0 0",
  fontSize: ".76rem",
  color: "var(--color-error, #dc2626)",
};

export const fieldWrapperStyle: CSSProperties = {
  marginBottom: "1.1rem",
};

export const formErrorBannerStyle: CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: ".7rem",
  padding: ".75rem .9rem",
  color: "var(--color-error, #dc2626)",
  fontSize: ".82rem",
  marginBottom: "1rem",
};

export const primaryButtonStyle: CSSProperties = {
  width: "100%",
  padding: ".85rem 1.5rem",
  borderRadius: ".85rem",
  border: "none",
  background: "var(--elf-orange)",
  color: "#fff",
  fontWeight: 700,
  fontSize: ".95rem",
  cursor: "pointer",
  minHeight: 48,
};

export const secondaryButtonStyle: CSSProperties = {
  width: "100%",
  padding: ".85rem 1.5rem",
  borderRadius: ".85rem",
  border: "1.5px solid var(--border-app, #e5e7eb)",
  background: "#fff",
  color: "var(--text-primary-app, #121110)",
  fontWeight: 700,
  fontSize: ".95rem",
  cursor: "pointer",
  minHeight: 48,
};
