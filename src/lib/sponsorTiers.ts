// Shared sponsor tier ordering/metadata — single source of truth so the
// Sponsors page and Team App Home page render sponsors in the same priority
// order and with the same tier colors/labels.

export const TIER_ORDER = [
  "title", "platinum", "gold", "silver", "bronze", "community_partner",
] as const;

export type Tier = typeof TIER_ORDER[number];

export const TIER_META: Record<Tier, { label: string; color: string; bg: string }> = {
  title:             { label: "Title Sponsor",     color: "#4c1d95", bg: "#ede9fe" },
  platinum:          { label: "Platinum",          color: "#0c4a6e", bg: "#e0f2fe" },
  gold:              { label: "Gold",              color: "#92400e", bg: "#fef3c7" },
  silver:            { label: "Silver",            color: "#374151", bg: "#f3f4f6" },
  bronze:            { label: "Bronze",            color: "#7c2d12", bg: "#ffedd5" },
  community_partner: { label: "Community Partner", color: "#065f46", bg: "#d1fae5" },
};
