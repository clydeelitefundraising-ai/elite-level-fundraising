// Complete Season Phase 3 — GET /api/team/[slug]/season/preview
//
// READ-ONLY. Returns what completing this team's season would do (who
// graduates, advances, carries over or must rejoin; what stays in history;
// what blocks it) plus a count of open Stripe checkouts. There is no write
// handler here and no route anywhere that starts a transition.
//
// Feature-flagged (COMPLETE_SEASON_PREVIEW=true); otherwise 404.
// Head Coach or platform admin only; the actor comes from the verified
// session (getTeamActor), never from the request. Everyone else is refused
// before the database is asked, so no names leak.
import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  canPreviewSeason,
  countOpenCheckouts,
  fetchSeasonPreview,
  isSeasonPreviewEnabled,
  parsePreviewOverrides,
  type PreviewFailure,
} from "@/lib/seasonPreview";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

const FAILURES: Record<PreviewFailure, { status: number; error: string; code: string }> = {
  not_installed:    { status: 503, code: "preview_unavailable", error: "Season completion isn't set up in this environment yet." },
  not_permitted:    { status: 503, code: "preview_unavailable", error: "Season completion isn't enabled for this environment yet." },
  account_required: { status: 403, code: "account_required", error: "Completing a season needs an ELF account. Sign in with your ELF account (or ask ELF to link one) to preview it." },
  forbidden:        { status: 403, code: "forbidden", error: "Only this team's Head Coach can preview completing the season." },
  not_found:        { status: 404, code: "not_found", error: "Team not found." },
  error:            { status: 500, code: "error", error: "The preview couldn't be loaded. Please try again." },
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isSeasonPreviewEnabled()) return json({ error: "Not found." }, 404);
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") return json({ error: "Sign in to continue.", code: "unauthorized" }, 401);
  if (!canPreviewSeason(actor)) return json({ error: FAILURES.forbidden.error, code: FAILURES.forbidden.code }, 403);

  const parsed = parsePreviewOverrides(req.nextUrl.searchParams);
  if (!parsed.ok) return json({ error: parsed.error, code: "invalid_request" }, 400);

  const [result, openCheckouts] = await Promise.all([
    fetchSeasonPreview(slug, actor, parsed.overrides),
    countOpenCheckouts(slug),
  ]);
  if (!result.ok) {
    const f = FAILURES[result.failure];
    return json({ error: f.error, code: f.code }, f.status);
  }
  return json({ preview: result.preview, openCheckouts });
}
