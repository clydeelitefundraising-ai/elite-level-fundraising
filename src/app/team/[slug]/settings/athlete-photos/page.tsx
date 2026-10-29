import { redirect } from "next/navigation";
import { getTeamActor } from "@/lib/permissions.server";
import { ReadOnlyFieldset } from "../../_components/SeasonStatus";
import SettingsScreen, { SettingsAccessGate } from "../SettingsScreen";
import PublicAthletePhotosSection from "../PublicAthletePhotosSection";
import { canOpenSettingsCategory } from "../settingsCategories";

// Settings → Public Athlete Photos (Phase T7; Head Coach only, also enforced
// by /api/team/[slug]/settings/public-athlete-photos — which still fails
// closed, requires the confirmation + wording version to turn on, audits
// every change and refuses a completed season).
export default async function PublicAthletePhotosSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") redirect("/coach-login");
  if (!canOpenSettingsCategory(actor, "athlete-photos")) {
    return <SettingsAccessGate slug={slug} title="Public Athlete Photos" who="Head Coach" />;
  }

  return (
    <SettingsScreen slug={slug} title="Public Athlete Photos" testId="settings-screen-athlete-photos">
      <ReadOnlyFieldset><PublicAthletePhotosSection slug={slug} /></ReadOnlyFieldset>
    </SettingsScreen>
  );
}
