// Complete Season Phase 5A/5B — POST /api/team/[slug]/season/complete
//
// Completes this team's season: archives it as read-only history and makes
// the next season active, in one database transaction
// (team_season_complete). Behind TWO flags (COMPLETE_SEASON_PREVIEW and
// COMPLETE_SEASON_EXECUTE, both off by default); otherwise 404.
//
// Head Coach or platform admin only; the actor comes from the verified
// session (getTeamActor), never from the request, and the database checks
// it again. Before calling the database, the server re-checks on a FRESH
// preview: the coach's preview is still current (fingerprint), there are no
// blockers, both typed confirmations match, and Stripe confirms no checkout
// for this team is still open. Payments fail closed (Phase 5B): if Stripe
// can't confirm that, completion is refused (503) — except on the isolated
// QA deployment with Stripe intentionally unconfigured. The database then
// repeats every season check under a row lock, so two simultaneous requests
// can never both complete it.
//
// Repeats are safe: the client sends one idempotency key per confirmation,
// and a retry with the same key returns the original receipt (replayed) —
// but only to an actor the database still authorizes, and never with the new
// join code. A season that is already completed skips the app-side
// pre-checks and goes straight to the database, which replays or refuses.
//
// No rollback exists or is offered: completion can't be undone from the app.
import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { canPreviewSeason, countOpenCheckouts, fetchSeasonPreview, type PreviewFailure } from "@/lib/seasonPreview";
import {
  allowUnverifiedCheckouts,
  confirmationMatches,
  executeSeasonCompletion,
  isSeasonCompletionEnabled,
  parseCompletionRequest,
  type CompletionFailure,
} from "@/lib/seasonComplete";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

const FAILURES: Record<CompletionFailure, { status: number; error: string }> = {
  not_installed:      { status: 503, error: "Season completion isn't set up in this environment yet." },
  not_permitted:      { status: 503, error: "Season completion isn't enabled for this environment yet." },
  account_required:   { status: 403, error: "Completing a season needs an ELF account. Sign in with your ELF account (or ask ELF to link one)." },
  forbidden:          { status: 403, error: "Only this team's Head Coach can complete the season." },
  not_found:          { status: 404, error: "Team not found." },
  already_completed:  { status: 409, error: "This season has already been completed." },
  stale:              { status: 409, error: "The team changed since this preview was loaded. Review the updated preview and confirm again." },
  confirmation:       { status: 400, error: "The confirmation doesn't match. Type the team address and the phrase exactly as shown." },
  duplicate_conflict: { status: 409, error: "This confirmation was already used for a different request. Reload the preview and confirm again." },
  busy:               { status: 409, error: "This season is being completed right now. Wait a moment, then reload." },
  blocked:            { status: 409, error: "Resolve the items listed in the preview before completing the season." },
  error:              { status: 500, error: "The season couldn't be completed. Nothing was changed if you see this before a receipt — you can safely try again." },
};

const PREVIEW_FAILURES: Record<PreviewFailure, CompletionFailure> = {
  not_installed: "not_installed",
  not_permitted: "not_permitted",
  account_required: "account_required",
  forbidden: "forbidden",
  not_found: "not_found",
  error: "error",
};

const fail = (failure: CompletionFailure, extra: Record<string, unknown> = {}) =>
  json({ error: FAILURES[failure].error, code: failure, ...extra }, FAILURES[failure].status);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isSeasonCompletionEnabled()) return json({ error: "Not found." }, 404);
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") return json({ error: "Sign in to continue.", code: "unauthorized" }, 401);
  if (!canPreviewSeason(actor)) return fail("forbidden");

  const parsed = parseCompletionRequest(await req.json().catch(() => null));
  if (!parsed.ok) return json({ error: parsed.error, code: "invalid_request" }, 400);
  const request = parsed.request;

  // Fresh preview, as the database computes it right now.
  const fresh = await fetchSeasonPreview(slug, actor, { toSlug: request.toSlug, toSeasonLabel: request.toSeasonLabel });
  if (!fresh.ok) return fail(PREVIEW_FAILURES[fresh.failure]);
  const preview = fresh.preview;
  let paymentsUnverified = false;

  if (!preview.from.completed) {
    if (preview.fingerprint !== request.fingerprint) return fail("stale");
    if (preview.blockers.length > 0) return fail("blocked", { blockers: preview.blockers });
    if (!confirmationMatches(
      { teamSlug: request.confirmTeamSlug, phrase: request.confirmation },
      { teamSlug: slug, phrase: preview.proposed.confirmation_phrase },
    )) return fail("confirmation");
    // Payments fail closed (Phase 5B). A checkout still open would record its
    // donation against this season after it is archived: wait for it. If
    // Stripe can't be asked (not configured, unreachable, unexpected answer),
    // completion is refused too — except on the isolated QA deployment with
    // Stripe intentionally unconfigured (allowUnverifiedCheckouts).
    const open = await countOpenCheckouts(slug);
    if (open.state === "checked" && (open.count > 0 || open.more)) {
      return json({
        error: "A donation checkout for this team is still open. Wait for it to finish (up to 24 hours), then try again.",
        code: "open_checkouts",
      }, 409);
    }
    if (open.state !== "checked") {
      if (!allowUnverifiedCheckouts()) {
        return json({
          error: "Open donation checkouts couldn't be verified right now, so the season can't be completed yet. Try again later.",
          code: "payments_unverified",
        }, 503);
      }
      paymentsUnverified = true;
      console.warn("[season-complete] QA only: completing with Stripe intentionally unconfigured (checkouts not verified)");
    }
  }

  const done = await executeSeasonCompletion(slug, actor, request);
  if (!done.ok) return fail(done.failure, done.blocker ? { blockers: [done.blocker] } : {});
  const r = done.result;
  return json({
    receipt: {
      transitionId: r.transition_id,
      fromSlug: r.from_slug,
      toSlug: r.to_slug,
      toSeasonLabel: r.to_season_label,
      completedAt: r.completed_at,
      replayed: r.replayed,
      summary: r.summary,
      newSeasonUrl: `/team/${encodeURIComponent(r.to_slug)}/home`,
      archivedSeasonUrl: `/team/${encodeURIComponent(r.from_slug)}/home`,
      ...(paymentsUnverified ? { paymentsUnverified: true } : {}),
    },
  });
}
