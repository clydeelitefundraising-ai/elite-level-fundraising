import { notFound } from "next/navigation";
import { requireTeamMembership } from "@/lib/permissions.server";
import { canPreviewSeason, isSeasonPreviewEnabled } from "@/lib/seasonPreview";
import SeasonPreviewScreen from "./SeasonPreviewScreen";
import { isSeasonCompletionEnabledForTeam } from "@/lib/seasonComplete";

export const dynamic = "force-dynamic";

// Complete Season Phase 3 — the read-only preview page. Exists only behind
// the COMPLETE_SEASON_PREVIEW flag, and only for the Head Coach or a
// platform admin; everyone else gets a plain 404 (its existence isn't
// revealed). The preview itself is loaded from the API, which re-checks.
export default async function CompleteSeasonPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isSeasonPreviewEnabled()) notFound();
  const { slug } = await params;
  const actor = await requireTeamMembership(slug);
  if (!canPreviewSeason(actor)) notFound();
  // Phase 5A: the confirm step exists only when COMPLETE_SEASON_EXECUTE is on
  // — and, since Stage F, only for a team in COMPLETE_SEASON_EXECUTE_TEAMS.
  return <SeasonPreviewScreen slug={slug} completionEnabled={isSeasonCompletionEnabledForTeam(slug)} />;
}
