// Shared fund-use icon system — the SINGLE place both the admin fund-use
// editor (AdminClient.tsx) and the public campaign page
// (PublicCampaignPage.tsx) resolve a `fund_uses.icon` value to a
// component. Do not duplicate this switch/lookup in either caller.
//
// `fund_uses.icon` is a plain text column (no schema change needed here —
// it always stored whatever string the admin UI wrote). Existing rows
// were written by the old EMOJI_PICKS-based picker as literal emoji
// characters; new saves write one of the stable identifiers below
// instead. resolveFundUseIcon() accepts either — a legacy emoji is
// normalized via LEGACY_EMOJI_MAP, a modern identifier is looked up
// directly, and anything unrecognized falls back to a safe default
// rather than rendering nothing or crashing. This is what makes the
// transition non-destructive: old rows keep rendering correctly forever,
// new rows just get better-looking, admin-friendly identifiers.
import {
  Plane, Bus, Footprints, Shirt, ClipboardList, Trophy, Users, Dumbbell,
  Utensils, Medal, Heart, Target, Megaphone, GraduationCap, Backpack,
  Activity, Shield, Building2, Flag, Snowflake, Coins,
  type LucideIcon,
} from "lucide-react";

export type FundUseIconOption = {
  id: string;
  label: string;
  Icon: LucideIcon;
};

// The full admin-selectable library. Order here is the order shown in
// the admin's icon grid. Keep this to a curated, youth/HS-sports-relevant
// set (roughly 15-25) rather than exposing lucide's entire catalog.
export const FUND_USE_ICON_OPTIONS: FundUseIconOption[] = [
  { id: "plane",          label: "Travel",                  Icon: Plane },
  { id: "bus",             label: "Transportation",          Icon: Bus },
  { id: "shoe",            label: "Equipment & Gear",        Icon: Footprints },
  { id: "shirt",           label: "Uniforms",                Icon: Shirt },
  { id: "clipboard",       label: "Meet & Entry Fees",       Icon: ClipboardList },
  { id: "trophy",          label: "Program Growth",          Icon: Trophy },
  { id: "users",           label: "Team",                    Icon: Users },
  { id: "dumbbell",        label: "Training & Recovery",     Icon: Dumbbell },
  { id: "utensils",        label: "Team Meals",              Icon: Utensils },
  { id: "medal",           label: "Awards & Recognition",    Icon: Medal },
  { id: "heart",           label: "Community Support",       Icon: Heart },
  { id: "target",          label: "Goals & Development",     Icon: Target },
  { id: "megaphone",       label: "Promotion & Spirit",      Icon: Megaphone },
  { id: "graduation-cap",  label: "Academic Support",        Icon: GraduationCap },
  { id: "backpack",        label: "Gear & Supplies",         Icon: Backpack },
  { id: "activity",        label: "Performance & Conditioning", Icon: Activity },
  { id: "shield",          label: "Safety Equipment",        Icon: Shield },
  { id: "building",        label: "Facility Improvements",   Icon: Building2 },
  { id: "flag",            label: "Competitions",            Icon: Flag },
  { id: "snowflake",       label: "Injury Prevention",       Icon: Snowflake },
  { id: "coins",           label: "Fundraising Costs",       Icon: Coins },
];

export const DEFAULT_FUND_USE_ICON_ID = "trophy";

const ICON_BY_ID = new Map(FUND_USE_ICON_OPTIONS.map((o) => [o.id, o]));

// Every emoji ever offered by the old AdminClient.tsx EMOJI_PICKS array,
// plus the two extra emoji used by CampaignPageClient's FALLBACK_MISSION
// placeholder (👕, 🍱) — audited directly from both sources, not guessed.
// Ball-sport emoji (⚽🏀🏈⚾🥎🎾🏐) have no dedicated icon in the curated
// library above and all map to the generic "activity" (athletic
// performance) icon rather than bloating the admin picker with one icon
// per sport.
const LEGACY_EMOJI_MAP: Record<string, string> = {
  "✈️": "plane",
  "🚌": "bus",
  "👟": "shoe",
  "🎽": "shirt",
  "👕": "shirt",
  "🏆": "trophy",
  "🥇": "medal",
  "💪": "dumbbell",
  "🏋️": "dumbbell",
  "🧊": "snowflake",
  "🍽️": "utensils",
  "🍱": "utensils",
  "🏟️": "building",
  "📋": "clipboard",
  "🧢": "shirt",
  "🏃": "activity",
  "⚽": "activity",
  "🏀": "activity",
  "🏈": "activity",
  "⚾": "activity",
  "🥎": "activity",
  "🎾": "activity",
  "🏐": "activity",
  "💰": "coins",
  "🎯": "target",
  "📚": "graduation-cap",
  "🛡️": "shield",
  "❤️": "heart",
};

// Normalizes any fund_uses.icon value (modern identifier or legacy
// emoji) to its canonical identifier. Never throws; unrecognized values
// fall back to DEFAULT_FUND_USE_ICON_ID rather than rendering nothing.
export function normalizeFundUseIconId(value: string | null | undefined): string {
  if (!value) return DEFAULT_FUND_USE_ICON_ID;
  if (ICON_BY_ID.has(value)) return value;
  return LEGACY_EMOJI_MAP[value] ?? DEFAULT_FUND_USE_ICON_ID;
}

// Resolves any fund_uses.icon value straight to its icon component —
// what both the admin picker (for showing the currently-selected icon)
// and the public campaign renderer actually want.
export function resolveFundUseIcon(value: string | null | undefined): LucideIcon {
  const id = normalizeFundUseIconId(value);
  return (ICON_BY_ID.get(id) ?? ICON_BY_ID.get(DEFAULT_FUND_USE_ICON_ID)!).Icon;
}
