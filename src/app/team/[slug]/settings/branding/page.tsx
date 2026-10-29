import { redirect } from "next/navigation";
import { getTeamActor } from "@/lib/permissions.server";
import { getCampaignSettings } from "@/lib/supabase";
import { ReadOnlyFieldset } from "../../_components/SeasonStatus";
import SettingsScreen, { SettingsAccessGate } from "../SettingsScreen";
import TeamBrandingSection from "../TeamBrandingSection";
import { canOpenSettingsCategory } from "../settingsCategories";

// Settings → Team Branding (Head Coach only; also enforced by
// /api/team/[slug]/settings/branding and /branding/logo). Read-only on a
// completed season via ReadOnlyFieldset, exactly as before.
export default async function TeamBrandingSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") redirect("/coach-login");
  if (!canOpenSettingsCategory(actor, "branding")) {
    return <SettingsAccessGate slug={slug} title="Team Branding" who="Head Coach" />;
  }

  const settings = await getCampaignSettings(slug);
  const branding = {
    school_name:          settings?.school_name ?? "",
    logo_url:             settings?.logo_url ?? "",
    primary_color:        settings?.primary_color ?? null,
    secondary_color:      settings?.secondary_color ?? null,
    branding_customized:  settings?.branding_customized ?? false,
  };

  return (
    <SettingsScreen slug={slug} title="Team Branding" description="Team logo and colors, with a live preview." testId="settings-screen-branding">
      <ReadOnlyFieldset><TeamBrandingSection slug={slug} branding={branding} /></ReadOnlyFieldset>
    </SettingsScreen>
  );
}
