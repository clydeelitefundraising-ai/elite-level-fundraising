// Fictional Team Overview, Staff, Gear Gallery and Partners records for the
// isolated Team App demo (/preview/team-app). NOTHING here is a real
// school, person, business, product, price agreement or store: links use
// the reserved .example domain, logos and product pictures are original
// illustrations (scripts/marketing/sample-assets.mjs), and no team sponsor
// has a sponsorship amount or contact on file — the demo never invents a
// sponsorship agreement.

import type { SponsorRow } from "@/lib/supabase";
import type { TeamProductRow } from "@/lib/teamData";
import type { StaffDisplayEntry } from "@/lib/staffAggregation";
import type { ActiveCommunityPartner } from "@/lib/platform/communityPartners";
import { SAMPLE_PREVIEW_PARTNERS } from "../demo/fixtures.ts";
import { DEMO_SLUG } from "./demoData.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ── Team Overview ───────────────────────────────────────────────────────────

/** The Overview card fields (campaign_settings' Phase T6 columns). */
export const DEMO_OVERVIEW = {
  team_banner_url: null as string | null,
  team_about:
    "Sunridge Valley Comets football is built on three things: effort, accountability and taking care of each other. " +
    "Our program welcomes every athlete who is willing to work, from first-year players to returning starters.\n\n" +
    "We practice Monday, Wednesday and Thursday after school, watch film on Tuesdays and play under the lights on Fridays. " +
    "Athletes are expected to be on time, keep their grades up and represent the Comets well in the classroom and in the community.\n\n" +
    "Families are a big part of what we do — from team dinners to the fall car wash. Thank you for supporting the Comets!",
  location: "Sunridge Valley, AZ",
  location_street: "4400 E. Comet Way",
  location_zip: "85999",
};

// ── Staff ───────────────────────────────────────────────────────────────────

/** Team -> Roster -> Staff (getTeamStaffDisplay): coaches plus the booster. */
export const DEMO_STAFF: StaffDisplayEntry[] = [
  { key: `coach:${id(101)}`, name: "Dana Whitfield", role: "head_coach", photo_url: null },
  { key: `coach:${id(102)}`, name: "Marcus Hale", role: "assistant_coach", photo_url: null },
  { key: `member:${id(401)}`, name: "Renee Calloway", role: "booster", photo_url: null },
];

// ── Gear Gallery ────────────────────────────────────────────────────────────

/** The team's external store (fictional, reserved .example domain). */
export const DEMO_STORE_URL = "https://comets-team-store.example";

const SHOP_IMG = (slug: string) => `/marketing/demo/shop/${slug}.svg`;

type ProductSeed = [slug: string, name: string, category: string, price: number, cost: number | null, description: string, visible: boolean, sizes: [string, number][]];

const PRODUCTS: ProductSeed[] = [
  ["team-hoodie", "Comets Team Hoodie", "Apparel", 45, 22, "Heavyweight navy hoodie with the Comets crest.", true, [["Youth M", 0], ["S", 0], ["M", 0], ["L", 0], ["XL", 0], ["2XL", 3]]],
  ["practice-tee", "Comets Practice Tee", "Apparel", 20, 8, "Lightweight gold performance tee for practice and game days.", true, [["S", 0], ["M", 0], ["L", 0], ["XL", 0]]],
  ["quarter-zip", "Sideline Quarter-Zip", "Apparel", 55, 28, "Navy quarter-zip pullover for cool Friday nights.", true, [["S", 0], ["M", 0], ["L", 0], ["XL", 0], ["2XL", 4]]],
  ["snapback", "Comets Snapback Cap", "Accessories", 25, 11, "Structured cap with an embroidered comet.", true, []],
  ["water-bottle", "Comets Water Bottle", "Accessories", 15, 6, "32 oz insulated bottle.", true, []],
  ["rally-towel", "Game Day Rally Towel", "Spirit Wear", 10, 3, "Wave it in the stands on Friday night.", true, []],
  ["parent-tee", "Proud Comets Parent Tee", "Spirit Wear", 22, 9, "Soft navy tee for the stands.", true, [["S", 0], ["M", 0], ["L", 0], ["XL", 0], ["2XL", 3]]],
  ["coaches-polo", "Coaches Polo", "Apparel", 38, 19, "Staff-only sideline polo.", false, [["M", 0], ["L", 0], ["XL", 0]]],
];

export function buildDemoProducts(now: Date): TeamProductRow[] {
  return PRODUCTS.map(([slug, name, category, price, cost, description, visible, sizes], i): TeamProductRow => {
    const productId = id(8001 + i);
    return {
      id: productId,
      campaign_slug: DEMO_SLUG,
      name,
      description,
      category,
      price_cents: price * 100,
      cost_cents: cost == null ? null : cost * 100,
      image_url: SHOP_IMG(slug),
      visible,
      display_order: i,
      created_at: new Date(now.getTime() - (50 - i) * 86_400_000).toISOString(),
      variants: sizes.map(([size, delta], k) => ({ id: id(8101 + i * 10 + k), product_id: productId, name: size, price_delta: delta * 100 })),
      external_url: visible ? `${DEMO_STORE_URL}/products/${slug}` : null,
    };
  });
}

// ── Team Sponsors ───────────────────────────────────────────────────────────

const SPONSOR_LOGO = (slug: string) => `/marketing/demo/sponsors/${slug}.svg`;

/** The team's own sponsors (fictional). No amounts or contacts on file. */
export function buildDemoSponsors(now: Date): SponsorRow[] {
  const seeds: [slug: string, name: string, tier: SponsorRow["tier"], description: string][] = [
    ["comet-lanes", "Comet Lanes Family Bowling", "title", "Home of the Comets team bowling night."],
    ["ridgecrest-market", "Ridgecrest Orchard Market", "gold", "Fresh fruit for every Friday-night locker room."],
    ["sundial-landscaping", "Sundial Landscaping", "silver", "Keeping Comets Field green all season."],
    ["mesquite-grill", "Mesquite Grill & BBQ", "bronze", "Post-game meals for the team."],
  ];
  return seeds.map(([slug, name, tier, description], i) => ({
    id: id(8501 + i),
    campaign_slug: DEMO_SLUG,
    name,
    url: `https://${slug}.example`,
    tier,
    logo_url: SPONSOR_LOGO(slug),
    description,
    display_order: i,
    visible: true,
    sponsorship_amount_cents: null,
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    created_at: new Date(now.getTime() - (70 - i) * 86_400_000).toISOString(),
  }));
}

// ── ELF Community Partners ──────────────────────────────────────────────────

/** The same fictional businesses and logos as the /fundraising sample's
 *  Community Partners — no websites, so no card links anywhere. */
export const DEMO_COMMUNITY_PARTNERS: ActiveCommunityPartner[] = SAMPLE_PREVIEW_PARTNERS.map(p => ({
  id: p.id,
  business_name: p.business_name,
  short_description: p.short_description,
  website_url: null,
  logo_url: p.logo_url,
  is_featured: false,
}));
