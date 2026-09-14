import { redirect } from "next/navigation";
import { getTeamActor } from "@/lib/permissions.server";
import { memberRoleLabel, platformAdminRoleLabel } from "@/lib/permissions";
import { getActiveJoinCode } from "@/lib/teamData";
import { getCampaignSettings } from "@/lib/supabase";
import SettingsView from "./SettingsView";
import MemberSettingsView from "./MemberSettingsView";

// Settings is reachable by every authenticated team role:
//   - Head Coach / Assistant Coach (actor.kind === "coach"): the full
//     SettingsView — general/account settings (AccountPrivacySection)
//     PLUS all existing coach/team settings (branding, staff, join
//     codes, coach fundraising, etc.), unchanged.
//   - Athlete / Parent / Booster, and a Platform Admin browsing this
//     team's settings (everyone else): MemberSettingsView — general/
//     account settings only (AccountPrivacySection: Blocked Users,
//     Delete Account). No coach-only control is ever exposed here.
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);

  // Public visitors → coach login
  if (actor.kind === "public") redirect(`/coach-login`);

  if (actor.kind === "coach") {
    const [activeCode, settings] = await Promise.all([
      getActiveJoinCode(slug),
      getCampaignSettings(slug),
    ]);
    return (
      <SettingsView
        slug={slug}
        coach={actor.session}
        initialCode={activeCode}
        joinCodeSettings={{
          school_name:   settings?.school_name ?? "",
          sport_name:    settings?.sport_name ?? "",
          mascot:        settings?.mascot ?? null,
          season:        settings?.season ?? null,
          primary_color: settings?.primary_color ?? "#0b1e3d",
        }}
        branding={{
          school_name:          settings?.school_name ?? "",
          logo_url:             settings?.logo_url ?? "",
          primary_color:        settings?.primary_color ?? null,
          secondary_color:      settings?.secondary_color ?? null,
          branding_customized:  settings?.branding_customized ?? false,
        }}
        allowCoachFundraising={settings?.allow_coach_fundraising ?? false}
      />
    );
  }

  // Member (athlete/parent/booster) or a Platform Admin browsing this
  // team's Settings page — general account settings only.
  const roleLabel = actor.kind === "member" ? memberRoleLabel(actor.session.role) : platformAdminRoleLabel();
  return <MemberSettingsView slug={slug} name={actor.session.name} roleLabel={roleLabel} />;
}
