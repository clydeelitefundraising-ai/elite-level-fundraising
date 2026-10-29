import { redirect } from "next/navigation";
import { getTeamActor } from "@/lib/permissions.server";
import { memberRoleLabel, platformAdminRoleLabel, staffRoleLabel } from "@/lib/permissions";
import { getActiveJoinCode } from "@/lib/teamData";
import { getCampaignSettings } from "@/lib/supabase";
import { getAccountSession } from "@/lib/accountSession";
import SettingsHome from "./SettingsHome";
import { settingsCategoriesFor, type SettingsCategory } from "./settingsCategories";

// Settings Redesign — the compact Settings home. Every authenticated team
// role lands here; settingsCategoriesFor() decides which category rows it
// sees (same boundaries as the previous single page):
//   - Head Coach: Team Access, Team Branding, Coach Fundraising, Public
//     Athlete Photos, Team Staff, Switch Teams + Notifications, Account.
//   - Assistant Coach (actor.kind === "coach"): Team Access, Switch Teams
//     + Notifications, Account.
//   - Athlete / Parent / Booster, and a Platform Admin browsing this team
//     (memberRoleLabel / platformAdminRoleLabel): Notifications, Account.
// Each row opens its own screen (settings/<category>/page.tsx), which
// re-checks the same rule server-side for direct URL visits.
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);

  // Public visitors → coach login
  if (actor.kind === "public") redirect(`/coach-login`);

  // Same elf_accounts.profile_photo_url source AccountMenu already
  // displays (see layout.tsx) — memoized per-request via React cache().
  // null for a legacy team_coach/team_member-cookie-only session.
  const accountSession = await getAccountSession();
  const photoUrl = accountSession?.profile_photo_url ?? null;

  const categories = settingsCategoriesFor(actor);
  const summaries: Partial<Record<SettingsCategory, string>> = {
    notifications: accountSession ? "Choose which push notifications you get" : "Activate your ELF account to manage",
    account: accountSession ? "Profile, blocked users and account deletion" : "Blocked users and account deletion",
  };

  let roleLabel: string;
  if (actor.kind === "coach") {
    roleLabel = staffRoleLabel(actor.session.role);
    const [activeCode, settings] = await Promise.all([
      getActiveJoinCode(slug),
      getCampaignSettings(slug),
    ]);
    summaries.access = activeCode ? `Join code ${activeCode.code} · Active` : "No active join code";
    summaries.branding = settings?.branding_customized ? "Custom team logo and colors" : "Default ELF theme";
    summaries["coach-fundraising"] = settings?.allow_coach_fundraising ? "On" : "Off";
    summaries["athlete-photos"] = settings?.public_athlete_photos ? "On" : "Off";
    summaries.staff = "Assistant coaches and boosters";
    summaries.teams = "Switch teams or add another team";
  } else {
    roleLabel = actor.kind === "member" ? memberRoleLabel(actor.session.role) : platformAdminRoleLabel();
  }

  return (
    <SettingsHome
      slug={slug}
      name={actor.session.name}
      roleLabel={roleLabel}
      photoUrl={photoUrl}
      categories={categories}
      summaries={summaries}
    />
  );
}
