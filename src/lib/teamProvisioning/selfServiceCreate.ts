import { randomBytes } from "crypto";
import { createCampaignSettings, CampaignSettingsError } from "@/lib/supabase";
import { restInsert, restDelete } from "@/lib/platform/_client";
import { generateSalt, hashPassword } from "@/lib/teamAuth";
import { generateJoinCode } from "@/lib/campaignCreate";
import { generateCampaignSlug, isValidCampaignSlugFormat } from "./slug";
import { resolveOrCreateOrganizationId } from "./organization";

export type SelfServiceTeamInput = {
  accountId:    string;
  accountName:  string;
  accountEmail: string;
  schoolName:   string;
  sportName:    string;
  season:       string;
};

export type SelfServiceTeamResult =
  | {
      ok: true;
      campaign_slug: string;
      school_name:   string;
      sport_name:    string;
      season:        string;
      join_code:     string;
    }
  | { ok: false; error: string; status: number };

/** Phase O2 — the one authenticated, server-side provisioning path for a
 *  coach to create a brand-new ELF Team for themselves. Mirrors
 *  createCampaignCore()'s (src/lib/campaignCreate.ts) proven sequence —
 *  campaign_settings, then team_coaches (head_coach), then a join code —
 *  but hardened for an untrusted self-service caller rather than the
 *  admin tool:
 *   - the creator's identity (account id/name/email) comes ONLY from the
 *     caller's already-resolved account session, never from request-body
 *     fields the caller controls (enforced by the route, not here — this
 *     function trusts whatever `input.accountId` it's given, so the
 *     route MUST only ever pass the session's own id);
 *   - no elf_accounts row is created or linked — the account already
 *     exists by definition (the caller is already signed in);
 *   - no coach_password is accepted or needed;
 *   - every failure after a record has been created is followed by an
 *     explicit compensating delete of exactly what THIS call created
 *     (never a pre-existing organization — see organization.ts), rather
 *     than createCampaignCore's fire-and-forget/swallowed-error approach,
 *     which is acceptable for an admin-operated tool but not for
 *     unsupervised self-service traffic (see the O2 report's partial-
 *     failure section for the full rationale).
 *
 *  fundraising_enabled is deliberately never written here — omitting the
 *  key lets campaign_settings' own column DEFAULT false (phase_f1a) apply,
 *  identical to how createCampaignCore already behaves today. */
export async function createSelfServiceTeam(input: SelfServiceTeamInput): Promise<SelfServiceTeamResult> {
  const schoolName = input.schoolName.trim();
  const sportName  = input.sportName.trim();
  const season     = input.season.trim();

  const slug = generateCampaignSlug(schoolName, sportName, season);
  if (!isValidCampaignSlugFormat(slug)) {
    return {
      ok: false,
      error: "Could not generate a valid team identifier from the school, sport, and season provided. Try a more specific school or sport name.",
      status: 400,
    };
  }

  let organizationId: string;
  try {
    organizationId = await resolveOrCreateOrganizationId(schoolName);
  } catch (err) {
    console.error("[selfServiceCreate] organization resolution failed:", err);
    return { ok: false, error: "Failed to resolve school information. Please try again.", status: 500 };
  }

  // ── 1. campaign_settings ──────────────────────────────────────────────
  // Reuses the exact same typed helper/collision convention
  // createCampaignCore() already relies on: POST ...?on_conflict=
  // campaign_slug&resolution=ignore-duplicates — a slug collision (ours or
  // a concurrent request's) surfaces as an empty response array, which
  // createCampaignSettings() turns into a plain "already exists" Error, OR
  // a CampaignSettingsError for any other DB failure. Nothing has been
  // created yet at this point, so there is nothing to roll back on either
  // failure path.
  try {
    await createCampaignSettings({
      campaign_slug:   slug,
      school_name:     schoolName,
      sport_name:      sportName,
      mascot:          "",
      goal_cents:       0,
      deadline:        "",
      primary_color:   "#1B4FA8",
      secondary_color: "#C4A35A",
      location:        "",
      season,
      logo_url:        "",
      show_leaderboard:       true,
      show_program_identity:  true,
      show_share_section:     true,
      show_fund_uses:         true,
      show_recent_donations:  true,
      show_sponsors:          true,
      show_donation_card:     true,
      layout_variant:         "classic",
      default_athlete_goal_cents: null,
      // Phase O2 requirement: fundraising never auto-activates. This is
      // the individual-coach-fundraising gate (orthogonal to
      // fundraising_enabled, which is simply never set below — see the
      // function doc comment).
      allow_coach_fundraising: false,
      organization_id: organizationId,
    });
  } catch (err) {
    if (err instanceof CampaignSettingsError && err.code === "23505") {
      return { ok: false, error: "A team for this school, sport, and season already exists.", status: 409 };
    }
    if (err instanceof Error && err.message.includes("already exists")) {
      return { ok: false, error: "A team for this school, sport, and season already exists.", status: 409 };
    }
    console.error("[selfServiceCreate] campaign_settings insert failed:", err);
    return { ok: false, error: "Failed to create your team. Please try again.", status: 500 };
  }

  // ── 2. team_coaches (head_coach, linked to the authenticated account) ──
  //
  // INERT LEGACY CREDENTIAL PLACEHOLDER — read this before touching
  // password_hash/salt below.
  //
  // team_coaches.password_hash/salt are NOT NULL columns in the real
  // schema (the legacy per-team credential system that predates
  // elf_accounts) — leaving them null is not possible without a migration,
  // which is outside O2's approved scope. An elf_session-backed
  // self-service coach has no legacy password and never needs one: modern
  // elf_session authentication (getAccountSession) is and remains the sole
  // authority for this account, both for creating this team and for every
  // later request. The value generated here exists ONLY to satisfy that
  // NOT NULL constraint — it is cryptographically random, generated fresh,
  // and discarded the instant it's hashed:
  //   - never returned in any API response
  //   - never logged (not even on error paths)
  //   - never emailed
  //   - never exposed to any client
  //   - never persisted anywhere except as its one-way hash below
  // Nobody — including this code, immediately after this block runs —
  // ever knows the plaintext again. That makes the legacy team_coach-
  // cookie login path mathematically unusable for this row, not merely
  // obscure: there is no credential to recover, guess, or leak. Do NOT
  // "fix" this by making the value memorable, deterministic, or
  // recoverable — that would turn an inert placeholder into a real,
  // weaker-than-modern second credential for this account, which is
  // exactly what this approach is designed to avoid. Do NOT change
  // existing legacy team_coach login behavior to accommodate this either.
  let coachId: string;
  try {
    const salt              = generateSalt();
    const throwawayPassword = randomBytes(32).toString("hex");
    const passwordHash      = hashPassword(throwawayPassword, salt);

    const rows = await restInsert<{ id: string }>("team_coaches", {
      campaign_slug: slug,
      name:          input.accountName,
      email:         input.accountEmail.toLowerCase(),
      role:          "head_coach",
      password_hash: passwordHash,
      salt,
      account_id:    input.accountId,
    });
    coachId = rows[0].id;
  } catch (err) {
    console.error("[selfServiceCreate] team_coaches insert failed, rolling back campaign_settings:", err);
    await rollbackCampaignSettings(slug);
    return { ok: false, error: "Failed to create your coach account for this team. Please try again.", status: 500 };
  }

  // ── 3. initial join code ────────────────────────────────────────────────
  try {
    const code = generateJoinCode();
    await restInsert("team_join_codes", { campaign_slug: slug, code });
    return { ok: true, campaign_slug: slug, school_name: schoolName, sport_name: sportName, season, join_code: code };
  } catch (err) {
    console.error("[selfServiceCreate] team_join_codes insert failed, rolling back team_coaches + campaign_settings:", err);
    await rollbackCoach(coachId);
    await rollbackCampaignSettings(slug);
    return { ok: false, error: "Failed to finish setting up your team. Please try again.", status: 500 };
  }
}

// Rollback targets ONLY records this function itself just created in THIS
// call — never the organization (see organization.ts's own doc comment:
// an organization is never deleted by provisioning failure, whether it
// pre-existed or was just created, since ownership of "was this org
// created by this request" can't be proven safe to act on later and a
// school record is shared/reusable data, not per-request scratch state).
async function rollbackCampaignSettings(slug: string): Promise<void> {
  try {
    await restDelete(`campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}`);
  } catch (err) {
    console.error("[selfServiceCreate] rollback failed — orphaned campaign_settings row for slug:", slug, err);
  }
}

async function rollbackCoach(coachId: string): Promise<void> {
  try {
    await restDelete(`team_coaches?id=eq.${encodeURIComponent(coachId)}`);
  } catch (err) {
    console.error("[selfServiceCreate] rollback failed — orphaned team_coaches row:", coachId, err);
  }
}
