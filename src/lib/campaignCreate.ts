import { createCampaignSettings } from "@/lib/supabase";
import { generateSalt, hashPassword } from "@/lib/teamAuth";
import { generateAccountSalt, hashAccountPassword } from "@/lib/accountAuth";
import { sendCoachWelcome } from "@/lib/email";
import { randomBytes } from "crypto";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export function supabaseHeaders(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey:        key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return Array.from(bytes).map(b => chars[b % chars.length]).join("");
}

export type CampaignCoreParams = {
  slug:            string;
  school_name:     string;
  sport_name:      string;
  mascot:          string;
  season:          string;
  location:        string;
  primary_color:   string;
  secondary_color: string;
  logo_url:        string;
  goal_cents:      number;
  deadline:        string;
  external_store_url?:         string | null;
  store_provider?:             string | null;
  show_leaderboard:            boolean;
  show_program_identity:       boolean;
  show_share_section:          boolean;
  show_fund_uses:              boolean;
  show_recent_donations:       boolean;
  show_sponsors:               boolean;
  show_donation_card:          boolean;
  layout_variant:              "classic" | "premium";
  default_athlete_goal_cents:  number | null;
  coach_name:      string;
  coach_email:     string;
  coach_password:  string;
  contact_goal:    number;
};

export type CampaignCoreResult =
  | { ok: true;  join_code: string }
  | { ok: false; error: string; status: number };

export async function createCampaignCore(p: CampaignCoreParams): Promise<CampaignCoreResult> {
  // 1. campaign_settings
  try {
    await createCampaignSettings({
      campaign_slug:              p.slug,
      school_name:                p.school_name,
      sport_name:                 p.sport_name,
      mascot:                     p.mascot,
      goal_cents:                 p.goal_cents,
      deadline:                   p.deadline,
      primary_color:              p.primary_color,
      secondary_color:            p.secondary_color,
      location:                   p.location,
      season:                     p.season,
      logo_url:                   p.logo_url,
      external_store_url:         p.external_store_url ?? null,
      store_provider:             p.store_provider ?? null,
      show_leaderboard:           p.show_leaderboard,
      show_program_identity:      p.show_program_identity,
      show_share_section:         p.show_share_section,
      show_fund_uses:             p.show_fund_uses,
      show_recent_donations:      p.show_recent_donations,
      show_sponsors:              p.show_sponsors,
      show_donation_card:         p.show_donation_card,
      layout_variant:             p.layout_variant,
      default_athlete_goal_cents: p.default_athlete_goal_cents,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create campaign.";
    return { ok: false, error: message, status: message.includes("already exists") ? 409 : 500 };
  }

  // 2. team_coaches
  const salt         = generateSalt();
  const passwordHash = hashPassword(p.coach_password, salt);

  const coachRes = await fetch(`${BASE}/rest/v1/team_coaches`, {
    method:  "POST",
    headers: supabaseHeaders({ Prefer: "return=minimal" }),
    body:    JSON.stringify({
      campaign_slug: p.slug,
      name:          p.coach_name,
      email:         p.coach_email.toLowerCase(),
      role:          "head_coach",
      password_hash: passwordHash,
      salt,
    }),
  });

  if (!coachRes.ok) {
    const msg    = await coachRes.text();
    const unique = msg.includes("23505") || msg.includes("unique");
    return {
      ok:     false,
      error:  unique ? "A coach with this email already exists." : "Failed to create coach account.",
      status: unique ? 409 : 500,
    };
  }

  // 2b. elf_accounts link (fire-and-forget — failure does not block campaign creation)
  void linkElfAccount(p.slug, p.coach_name, p.coach_email, p.coach_password);

  // 2c. welcome email (fire-and-forget)
  void sendWelcomeEmail(p);

  // 3. join code
  const joinCode = generateJoinCode();
  await fetch(`${BASE}/rest/v1/team_join_codes`, {
    method:  "POST",
    headers: supabaseHeaders({ Prefer: "return=minimal" }),
    body:    JSON.stringify({ campaign_slug: p.slug, code: joinCode }),
  });

  // 4. contact goal (team default)
  if (p.contact_goal > 0) {
    await fetch(`${BASE}/rest/v1/fundraising_contact_goals`, {
      method:  "POST",
      headers: supabaseHeaders({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ campaign_slug: p.slug, athlete_id: null, goal: p.contact_goal }),
    }).catch(() => {});
  }

  return { ok: true, join_code: joinCode };
}

async function linkElfAccount(
  slug:      string,
  coachName: string,
  coachEmail: string,
  password:  string,
): Promise<void> {
  try {
    const email = coachEmail.trim().toLowerCase();
    let accountId: string | null = null;

    const existingRes = await fetch(
      `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
      { headers: supabaseHeaders(), cache: "no-store" },
    );
    const existingRows = existingRes.ok ? await existingRes.json() : [];

    if (Array.isArray(existingRows) && existingRows.length > 0) {
      accountId = (existingRows[0] as { id: string }).id;
    } else {
      const acctSalt = generateAccountSalt();
      const acctHash = hashAccountPassword(password, acctSalt);
      const acctRes  = await fetch(`${BASE}/rest/v1/elf_accounts`, {
        method:  "POST",
        headers: supabaseHeaders({ Prefer: "return=representation" }),
        body:    JSON.stringify({ email, name: coachName.trim(), password_hash: acctHash, salt: acctSalt }),
      });
      if (acctRes.ok) {
        const rows = await acctRes.json();
        accountId  = (rows[0] as { id: string }).id;
      }
    }

    if (!accountId) return;

    const coachLookup = await fetch(
      `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
      { headers: supabaseHeaders(), cache: "no-store" },
    );
    if (!coachLookup.ok) return;
    const coachRows = await coachLookup.json();
    if (!Array.isArray(coachRows) || !coachRows.length) return;

    const coachId = (coachRows[0] as { id: string }).id;
    await fetch(`${BASE}/rest/v1/team_coaches?id=eq.${encodeURIComponent(coachId)}`, {
      method:  "PATCH",
      headers: supabaseHeaders({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ account_id: accountId }),
    });
  } catch (err) {
    console.error("[campaignCreate] elf_accounts link failed:", err);
  }
}

async function sendWelcomeEmail(p: CampaignCoreParams): Promise<void> {
  try {
    const teamName = [p.school_name, p.mascot, p.sport_name].filter(Boolean).join(" ");
    const appBase  = process.env.NEXT_PUBLIC_APP_URL ?? "";
    await sendCoachWelcome({
      to:           p.coach_email.toLowerCase(),
      coachName:    p.coach_name,
      teamName:     teamName || p.slug,
      loginUrl:     `${appBase}/login`,
      email:        p.coach_email.toLowerCase(),
      tempPassword: p.coach_password,
      teamHubUrl:   `${appBase}/team/${p.slug}`,
    });
  } catch (err) {
    console.error("[campaignCreate] sendCoachWelcome failed:", err);
  }
}
