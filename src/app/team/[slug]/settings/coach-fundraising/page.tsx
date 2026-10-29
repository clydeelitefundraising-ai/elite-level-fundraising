import { redirect } from "next/navigation";
import { getTeamActor } from "@/lib/permissions.server";
import { getCampaignSettings } from "@/lib/supabase";
import { ReadOnlyFieldset } from "../../_components/SeasonStatus";
import SettingsScreen, { SettingsAccessGate } from "../SettingsScreen";
import CoachFundraisingSection from "../CoachFundraisingSection";
import { canOpenSettingsCategory } from "../settingsCategories";

// Settings → Coach Fundraising (Head Coach only; also enforced by
// /api/team/[slug]/settings/coach-fundraising and /coach-fundraisers).
export default async function CoachFundraisingSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") redirect("/coach-login");
  if (!canOpenSettingsCategory(actor, "coach-fundraising")) {
    return <SettingsAccessGate slug={slug} title="Coach Fundraising" who="Head Coach" />;
  }

  const settings = await getCampaignSettings(slug);
  const allowCoachFundraising = settings?.allow_coach_fundraising ?? false;

  return (
    <SettingsScreen slug={slug} title="Coach Fundraising" description="Let coaches fundraise alongside athletes and set their goals." testId="settings-screen-coach-fundraising">
      <ReadOnlyFieldset><CoachFundraisingSection slug={slug} initialAllowCoachFundraising={allowCoachFundraising} /></ReadOnlyFieldset>
    </SettingsScreen>
  );
}
