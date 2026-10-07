import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAccountSession } from "@/lib/accountSession";
import { consumeRateLimit, identifierRateLimitKey } from "@/lib/rateLimit";
import { createSelfServiceTeam } from "@/lib/teamProvisioning/selfServiceCreate";
import { validateSelfServiceSeason } from "@/lib/teamProvisioning/season";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

const MAX_FIELD = 200;

// Phase O2 — conservative but not punitive: a legitimate coach creating a
// handful of sport/season teams in one sitting must never be blocked, but
// an unattended create-loop should be. 5 creates per rolling 24h is well
// above any plausible legitimate single-sitting count and well below
// anything a human would notice as a limit, while making a spam loop
// (this is a real-work-costing action — multiple inserts + an
// organization lookup/create, not a cheap read) expensive to repeat.
// Compare: checkout allows 10/10min (payment-risk, short window);
// marketing demo-request allows 5/hour (public, unauthenticated lead
// capture). Team creation is authenticated and heavier than either, so a
// longer window with a similarly small count fits the existing scale.
const CREATE_LIMIT = { limit: 5, windowSeconds: 86_400 };

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  // Phase O2 §3 (nonnegotiable): the ONLY authority for this route is the
  // caller's own already-authenticated elf_session account — never the
  // legacy shared-password /admin cookie, never a legacy team_coach/
  // team_member cookie, never any client-supplied account_id/email/role.
  const account = await getAccountSession();
  if (!account) {
    return NextResponse.json({ error: "You must be signed in to create a team." }, { status: 401 });
  }

  // Rate-limit identity is the authenticated account's own id, hashed per
  // rateLimit.ts's documented contract for identifierRateLimitKey (never a
  // raw, reversible identifier as the Redis key) — never anything
  // client-supplied.
  const accountIdHash = createHash("sha256").update(account.id).digest("hex");
  const rl = await consumeRateLimit(identifierRateLimitKey("team-onboarding-create", accountIdHash), CREATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "You've created several teams recently. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const schoolName    = clean(body.schoolName, MAX_FIELD);
  const sportName     = clean(body.sportName, MAX_FIELD);
  const rawSeason     = clean(body.season, MAX_FIELD);

  const errors: Record<string, string> = {};
  if (!schoolName) errors.schoolName = "School or organization name is required.";
  if (!sportName)  errors.sportName  = "Sport is required.";

  // Canonical season format — self-service onboarding ONLY (the legacy
  // admin flow keeps accepting free-text season strings, untouched here).
  // No silent coercion of an ambiguous value ("Fall 2026", "2026-27") into
  // a guessed year — any non-exact-four-digit input is rejected outright.
  let season = "";
  if (!rawSeason) {
    errors.season = "Season or year is required.";
  } else {
    const seasonResult = validateSelfServiceSeason(rawSeason);
    if (!seasonResult.ok) {
      errors.season = seasonResult.error;
    } else {
      season = seasonResult.season;
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Invalid input.", errors }, { status: 400 });
  }

  const result = await createSelfServiceTeam({
    accountId:    account.id,
    accountName:  account.name,
    accountEmail: account.email,
    schoolName,
    sportName,
    season,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Audit trail — same event shape /api/admin/onboard already logs for the
  // legacy flow ("campaign.created"), but attributed to the real coach
  // identity instead of the no-individual-identity ADMIN_TOOL_ACTOR, since
  // self-service has one. This is additive use of existing audit_logs
  // infrastructure — no schema change.
  logAuditEvent({
    actor:         { type: "coach", id: account.id, name: account.name },
    action:        "campaign.created",
    entity_type:   "campaign",
    entity_id:     result.campaign_slug,
    campaign_slug: result.campaign_slug,
    summary:       `Self-service team created: "${result.school_name}" ${result.sport_name} (${result.campaign_slug})`,
    new_value:     { campaign_slug: result.campaign_slug, school_name: result.school_name, sport_name: result.sport_name, season: result.season },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  // Minimal success payload — only what an O3 UI needs to confirm creation
  // and let the coach start inviting people; never salts/hashes/account
  // internals.
  return NextResponse.json({
    ok:            true,
    campaign_slug: result.campaign_slug,
    school_name:   result.school_name,
    sport_name:    result.sport_name,
    season:        result.season,
    join_code:     result.join_code,
  });
}
