import { redirect } from "next/navigation";
import { getTeamActor } from "@/lib/permissions.server";
import { getActiveJoinCode } from "@/lib/teamData";
import { getCampaignSettings } from "@/lib/supabase";
import SettingsScreen, { SettingsAccessGate } from "../SettingsScreen";
import TeamAccessSection from "../TeamAccessSection";
import { canOpenSettingsCategory } from "../settingsCategories";

// Settings → Team Access (Head and Assistant Coach). Copy link, Team QR and
// the printable signup sheet for all coaches; New Code / Revoke stay
// Head-Coach-only inside TeamAccessSection and in /api/team/[slug]/join-codes.
export default async function TeamAccessSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") redirect("/coach-login");
  if (actor.kind !== "coach" || !canOpenSettingsCategory(actor, "access")) {
    return <SettingsAccessGate slug={slug} title="Team Access" who="coaching staff" />;
  }

  const [activeCode, settings] = await Promise.all([
    getActiveJoinCode(slug),
    getCampaignSettings(slug),
  ]);

  return (
    <SettingsScreen slug={slug} title="Team Access" description="Join link, team QR code and printable signup sheet." testId="settings-screen-access">
      <TeamAccessSection
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
      />
    </SettingsScreen>
  );
}
