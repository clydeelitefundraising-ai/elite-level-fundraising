import { redirect } from "next/navigation";
import { getTeamActor } from "@/lib/permissions.server";
import { memberRoleLabel, platformAdminRoleLabel } from "@/lib/permissions";
import { getActiveJoinCode } from "@/lib/teamData";
import { getCampaignSettings } from "@/lib/supabase";
import SettingsView from "./SettingsView";
import MemberSettingsView from "./MemberSettingsView";

// Apple-review UI polish: Settings previously dead-ended for every
// non-coach role ("Coach Access Only"), even though the nav links to it
// for everyone — meaning athletes/parents/boosters had no Settings page
// at all, and no way to reach Blocked Users/Delete Account outside the
// AccountMenu flyout. Coaches keep the exact same full settings
// experience as before (team config, branding, staff, etc., all
// unchanged); every other role now gets a smaller, general-only settings
// view (MemberSettingsView) with account/privacy controls only — no
// coach-only control is ever exposed to a non-coach.
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
