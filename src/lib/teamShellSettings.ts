// Minimal campaign_settings views for code that runs before (or without) a
// team-membership check.
//
// The team layout (`app/team/[slug]/layout.tsx`) renders for every visitor
// of any `/team/<slug>/…` URL — pages decide afterwards whether to redirect
// a non-member — and the Shop page is open to everyone. Whatever settings
// they hand to client components is serialized into the page payload, so
// they must only ever pass these allow-listed, already-public display fields
// (the same identity the public fundraising page shows), never the whole
// row: it also holds internal ids (team_id, organization_id, crm_contact_id,
// program_id), status/demo flags and the members-only Team Overview fields
// (team_about, location_street, location_zip, team_banner_url).
//
// Pages that need more call getCampaignSettings themselves after
// requireTeamMembership / getTeamActor has authorized the viewer.
import type { CampaignSettings } from "@/lib/supabase";

/** What the team chrome (TeamChrome, TeamHeader, DesktopSidebar) renders:
 *  team identity, logo and colors. */
export const TEAM_SHELL_FIELDS = [
  "campaign_slug", "school_name", "sport_name", "mascot", "season",
  "logo_url", "team_photo", "primary_color", "secondary_color",
] as const satisfies readonly (keyof CampaignSettings)[];

export type TeamShellSettings = Pick<CampaignSettings, (typeof TEAM_SHELL_FIELDS)[number]>;

/** What the (public) Shop page renders. */
export const SHOP_SETTINGS_FIELDS = [
  "primary_color", "external_store_url", "store_provider",
] as const satisfies readonly (keyof CampaignSettings)[];

export type ShopSettings = Pick<CampaignSettings, (typeof SHOP_SETTINGS_FIELDS)[number]>;

function pick<K extends keyof CampaignSettings>(settings: CampaignSettings, fields: readonly K[]): Pick<CampaignSettings, K> {
  const out: Partial<Pick<CampaignSettings, K>> = {};
  for (const f of fields) {
    if (settings[f] !== undefined) out[f] = settings[f];
  }
  return out as Pick<CampaignSettings, K>;
}

export function toTeamShellSettings(settings: CampaignSettings): TeamShellSettings {
  return pick(settings, TEAM_SHELL_FIELDS);
}

export function toShopSettings(settings: CampaignSettings): ShopSettings {
  return pick(settings, SHOP_SETTINGS_FIELDS);
}
