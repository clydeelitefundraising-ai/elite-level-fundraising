// Deterministic sponsor rotation for the Team App Home page.
//
// Gold-and-above sponsors must always outrank Silver, Silver above Bronze,
// Bronze above untiered — but within a tier the order should rotate between
// visits so no single sponsor is stuck at the back forever. Never uses
// Math.random() during render (hydration-unsafe); instead this runs
// server-side in home/page.tsx with a seed derived from the campaign slug
// and the current calendar day, so the order is identical for every request
// within a day (no hydration mismatch — server and client never disagree)
// and changes once per day thereafter.
import type { SponsorRow } from "@/lib/teamData";
import { TIER_ORDER } from "@/lib/sponsorTiers";

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// mulberry32 — small, fast, deterministic PRNG from an integer seed.
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  const rand = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Same calendar day → same seed → same rotation for every visit that day. */
export function dailySeed(slug: string): number {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return hashString(`${slug}:${today}`);
}

/** Groups sponsors by tier (Title/Platinum/Gold above Silver above Bronze
 *  above Community Partner), shuffling only within each tier so priority
 *  order between tiers never changes. */
export function sortSponsorsForHome(sponsors: SponsorRow[], slug: string): SponsorRow[] {
  const seed = dailySeed(slug);
  const out: SponsorRow[] = [];
  TIER_ORDER.forEach((tier, tierIndex) => {
    const inTier = sponsors.filter(s => s.tier === tier);
    out.push(...seededShuffle(inTier, seed + tierIndex));
  });
  return out;
}
