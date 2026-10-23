// Complete Season Phase 5A — completing a season (the real transition).
//
// Server only. Calls public.team_season_complete_checked() (phase_s4: the
// only completion entry point the server key may run). It checks the actor
// BEFORE any replay — and, for an already-completed season, that a Head
// Coach still runs the successor season — strips the new join code from
// every result, then runs the unchanged phase_s1 transition, which does
// everything in ONE transaction: it locks the season, replays a repeated
// idempotency key, recomputes the preview and refuses a stale fingerprint,
// a wrong confirmation phrase, an already-completed season and every
// blocker before it writes anything.
// Nothing here re-implements any of that; this file only
//   * decides whether completion is switched on (COMPLETE_SEASON_EXECUTE),
//   * validates the request shape,
//   * builds p_actor from the verified session (never the client), and
//   * maps the database's fixed error codes to plain answers.
import type { TeamActor } from "./permissions.ts";
import { seasonPreviewDbActor } from "./seasonPreview.ts";
import { isMissingSchemaError } from "./teamTasksStore.ts";
import { checkDeployment, QA_UNVERIFIED_CHECKOUTS } from "./deploymentGuard.ts";

// The typed-confirmation rules live in a client-safe module (the browser
// uses them to enable the button); re-exported here for the server.
export { confirmationMatches, normalizeConfirmation } from "./seasonConfirmation.ts";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** Completion exists only when BOTH flags are exactly "true": the preview
 *  (COMPLETE_SEASON_PREVIEW) and the action (COMPLETE_SEASON_EXECUTE). Off by
 *  default; server-side only. */
export function isSeasonCompletionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.COMPLETE_SEASON_PREVIEW === "true" && env.COMPLETE_SEASON_EXECUTE === "true";
}

/** Phase 5B — payments fail closed: when open Stripe checkouts can't be
 *  verified ("unknown"), completion is refused. The ONE exception is the
 *  isolated QA deployment exercising synthetic completions with Stripe
 *  intentionally unconfigured: ELF_QA_ALLOW_UNVERIFIED_CHECKOUTS is exactly
 *  "true", no Stripe key is set, and the deployment guard confirms a valid QA
 *  deployment (the guard also refuses the variable everywhere else, so a
 *  production build with it set fails). Never true for an unreachable Stripe
 *  that IS configured. */
export function allowUnverifiedCheckouts(env: Record<string, string | undefined> = process.env): boolean {
  if (env[QA_UNVERIFIED_CHECKOUTS] !== "true") return false;
  if ((env.STRIPE_SECRET_KEY ?? "").trim()) return false;
  const deployment = checkDeployment(env);
  return deployment.mode === "qa" && deployment.errors.length === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/;

export type CompletionRequest = {
  fingerprint: string;
  idempotencyKey: string;
  confirmTeamSlug: string;
  confirmation: string;
  toSlug: string | null;
  toSeasonLabel: string | null;
};

/** Validates the client's request body. Identity is never read from it. */
export function parseCompletionRequest(body: unknown): { ok: true; request: CompletionRequest } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const fingerprint = str(b.fingerprint).trim();
  const idempotencyKey = str(b.idempotencyKey).trim();
  const confirmTeamSlug = str(b.confirmTeamSlug);
  const confirmation = str(b.confirmation);
  const toSlug = str(b.toSlug).trim().toLowerCase();
  const toSeasonLabel = str(b.toSeasonLabel).trim();
  if (!/^[0-9a-f]{32}$/.test(fingerprint)) return { ok: false, error: "Load the preview again before completing the season." };
  if (!UUID.test(idempotencyKey)) return { ok: false, error: "This request is missing its confirmation id. Reload the page and try again." };
  if (confirmTeamSlug.length > 100 || confirmation.length > 100) return { ok: false, error: "The confirmation is too long." };
  if (toSlug && !SLUG.test(toSlug)) return { ok: false, error: "The new team address can only use lowercase letters, numbers and hyphens (3–80 characters)." };
  if (toSeasonLabel.length > 40) return { ok: false, error: "The season name can be at most 40 characters." };
  return { ok: true, request: { fingerprint, idempotencyKey, confirmTeamSlug, confirmation, toSlug: toSlug || null, toSeasonLabel: toSeasonLabel || null } };
}

// ── The database's answer ────────────────────────────────────────────────
export type CompletionResult = {
  transition_id: string;
  from_slug: string;
  to_slug: string;
  to_season_label: string;
  completed_at: string;
  replayed: boolean;
  summary: Record<string, number | boolean>;
};

export type CompletionFailure =
  | "not_installed"        // the Complete Season migrations aren't in this database
  | "not_permitted"        // phase_s4's grant isn't in this database
  | "account_required"     // a legacy (team-login) Head Coach
  | "forbidden"            // the database refused the actor
  | "not_found"
  | "already_completed"
  | "stale"                // the season changed since the preview
  | "confirmation"         // the typed phrase didn't match
  | "duplicate_conflict"   // the same confirmation id was used for a different request
  | "busy"                 // another completion of this season is in progress
  | "blocked"              // one of the preview's blockers
  | "error";

/** Maps a failed rpc response to a failure (+ the blocker code for
 *  "blocked"). Never echoes the database's text. */
export function classifyCompletionError(body: string): { failure: CompletionFailure; blocker?: string } {
  if (isMissingSchemaError(body)) return { failure: "not_installed" };
  let code = "", message = "";
  try { const j = JSON.parse(body); code = String(j?.code ?? ""); message = String(j?.message ?? ""); } catch { /* not JSON */ }
  if (code === "42501" || /permission denied/i.test(message)) return { failure: "not_permitted" };
  if (code === "55P03" || /lock timeout|could not obtain lock/i.test(message)) return { failure: "busy" };
  const m = message.match(/\bseason_[a-z_]+\b/);
  const sc = m ? m[0] : "";
  switch (sc) {
    case "season_actor_account_required": return { failure: "account_required" };
    case "season_actor_invalid":
    case "season_actor_not_authorized": return { failure: "forbidden" };
    case "season_team_not_found": return { failure: "not_found" };
    case "season_already_completed": return { failure: "already_completed" };
    case "season_preview_stale":
    case "season_preview_required":
    case "season_roster_changed_during_transition":
    case "season_plan_mismatch": return { failure: "stale" };
    case "season_confirmation_mismatch": return { failure: "confirmation" };
    case "season_idempotency_conflict": return { failure: "duplicate_conflict" };
    case "season_idempotency_key_required": return { failure: "error" };
    case "": return { failure: "error" };
    default: return { failure: "blocked", blocker: sc };
  }
}

function isResultShape(v: unknown): v is CompletionResult {
  const r = v as CompletionResult;
  return !!r && typeof r === "object" && typeof r.transition_id === "string" && typeof r.from_slug === "string"
    && typeof r.to_slug === "string" && typeof r.replayed === "boolean" && !!r.summary && typeof r.summary === "object";
}

/** Runs the transition. p_actor comes from the verified session only. The
 *  phrase sent is the one the coach typed — the database re-checks it. */
export async function executeSeasonCompletion(slug: string, actor: TeamActor, req: CompletionRequest):
  Promise<{ ok: true; result: CompletionResult } | { ok: false; failure: CompletionFailure; blocker?: string }> {
  const dbActor = seasonPreviewDbActor(actor);
  if (!dbActor) return { ok: false, failure: "forbidden" };
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const res = await fetch(`${BASE}/rest/v1/rpc/team_season_complete_checked`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_from_slug: slug,
        p_actor: dbActor,
        p_to_slug: req.toSlug,
        p_to_season_label: req.toSeasonLabel,
        p_expected_fingerprint: req.fingerprint,
        p_idempotency_key: req.idempotencyKey,
        p_confirmation: req.confirmation,
      }),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      const c = classifyCompletionError(text);
      if (c.failure === "error") console.error(`[season-complete] failed: HTTP ${res.status}`);
      return { ok: false, ...c };
    }
    const value = JSON.parse(text);
    if (!isResultShape(value)) {
      console.error("[season-complete] unexpected result shape");
      return { ok: false, failure: "error" };
    }
    return { ok: true, result: value };
  } catch {
    // The request may or may not have reached the database; the coach can
    // safely retry with the same confirmation id (the database replays it).
    console.error("[season-complete] request failed");
    return { ok: false, failure: "error" };
  }
}
