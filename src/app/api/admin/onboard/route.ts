import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { createCampaignSettings } from "@/lib/supabase";
import { generateSalt, hashPassword } from "@/lib/teamAuth";
import { generateAccountSalt, hashAccountPassword } from "@/lib/accountAuth";
import { sendCoachWelcome } from "@/lib/email";
import { randomBytes } from "crypto";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

function generateJoinCode(): string {
  // Avoids O/0/I/1 for readability
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return Array.from(bytes).map(b => chars[b % chars.length]).join("");
}

const DEFAULT_FUND_USES = [
  { icon: "✈️",  title: "Travel & Transportation", description: "Away meets, regional championships, and travel to compete.",                             sort_order: 0 },
  { icon: "📋", title: "Meet Entry Fees",           description: "Registration costs for conference meets, invitationals, and state qualifiers.",          sort_order: 1 },
  { icon: "👟", title: "Equipment & Gear",          description: "Sport-specific equipment and training tools.",                                           sort_order: 2 },
  { icon: "👕", title: "Uniforms",                  description: "Competition uniforms, warm-up suits, and team apparel for all athletes.",                sort_order: 3 },
  { icon: "💪", title: "Recovery Tools",            description: "Foam rollers, resistance bands, ice packs, and injury prevention equipment.",            sort_order: 4 },
  { icon: "🍱", title: "Team Meals",                description: "Pre-meet fueling and post-competition meals to keep athletes performing at their best.", sort_order: 5 },
];

type StarterAthlete = { name?: unknown; event?: unknown };

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const {
    campaign_slug,
    school_name, sport_name, mascot, season, location,
    primary_color, secondary_color, logo_url,
    goal_cents, deadline,
    external_store_url, store_provider,
    coach_name, coach_email, coach_password,
    seed_fund_uses,
    starter_athletes,
  } = body;

  // ── Validate ─────────────────────────────────────────────────────────────────
  const slug = String(campaign_slug ?? "").trim();
  if (!slug)                             return NextResponse.json({ error: "Campaign slug is required." }, { status: 400 });
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return NextResponse.json({ error: "Slug must be lowercase letters, numbers, and hyphens only." }, { status: 400 });
  if (slug.length < 3)                   return NextResponse.json({ error: "Slug must be at least 3 characters." }, { status: 400 });

  if (!String(coach_name  ?? "").trim()) return NextResponse.json({ error: "Coach name is required." },  { status: 400 });
  if (!String(coach_email ?? "").trim()) return NextResponse.json({ error: "Coach email is required." }, { status: 400 });
  const pw = String(coach_password ?? "").trim();
  if (pw.length < 8) return NextResponse.json({ error: "Coach password must be at least 8 characters." }, { status: 400 });

  // ── 1. campaign_settings ─────────────────────────────────────────────────────
  try {
    await createCampaignSettings({
      campaign_slug:   slug,
      school_name:     String(school_name  ?? "").trim(),
      sport_name:      String(sport_name   ?? "").trim(),
      mascot:          String(mascot       ?? "").trim(),
      goal_cents:      typeof goal_cents === "number" ? Math.round(goal_cents) : 0,
      deadline:        String(deadline     ?? "").trim(),
      primary_color:   String(primary_color  ?? "#1B4FA8"),
      secondary_color: String(secondary_color ?? "#C4A35A"),
      location:        String(location     ?? "").trim(),
      season:          String(season       ?? "").trim(),
      logo_url:        String(logo_url     ?? "").trim(),
      external_store_url: external_store_url ? String(external_store_url).trim() || null : null,
      store_provider:  store_provider ? String(store_provider).trim() || null : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create campaign.";
    const status  = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  // ── 2. team_coaches (head coach) ──────────────────────────────────────────────
  const salt          = generateSalt();
  const password_hash = hashPassword(pw, salt);

  const coachRes = await fetch(`${BASE}/rest/v1/team_coaches`, {
    method:  "POST",
    headers: h({ Prefer: "return=minimal" }),
    body:    JSON.stringify({
      campaign_slug: slug,
      name:          String(coach_name).trim(),
      email:         String(coach_email).trim().toLowerCase(),
      role:          "head_coach",
      password_hash,
      salt,
    }),
  });

  if (!coachRes.ok) {
    const msg      = await coachRes.text();
    const isUnique = msg.includes("23505") || msg.includes("unique");
    return NextResponse.json(
      { error: isUnique ? "A coach with this email already exists." : "Failed to create coach account." },
      { status: isUnique ? 409 : 500 },
    );
  }

  // Create or link an elf_accounts row so the new coach can use /login.
  void (async () => {
    try {
      const normalEmail = String(coach_email).trim().toLowerCase();
      let accountId: string | null = null;

      const existingRes = await fetch(
        `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(normalEmail)}&select=id&limit=1`,
        { headers: h(), cache: "no-store" },
      );
      const existingRows = existingRes.ok ? await existingRes.json() : [];

      if (Array.isArray(existingRows) && existingRows.length > 0) {
        accountId = (existingRows[0] as { id: string }).id;
      } else {
        const acctSalt         = generateAccountSalt();
        const acctPasswordHash = hashAccountPassword(pw, acctSalt);
        const acctRes = await fetch(`${BASE}/rest/v1/elf_accounts`, {
          method:  "POST",
          headers: h({ Prefer: "return=representation" }),
          body:    JSON.stringify({ email: normalEmail, name: String(coach_name).trim(), password_hash: acctPasswordHash, salt: acctSalt }),
        });
        if (acctRes.ok) {
          const acctRows = await acctRes.json();
          accountId = (acctRows[0] as { id: string }).id;
        }
      }

      if (accountId) {
        // We need the coach id — re-fetch by email+slug since coachRes used return=minimal
        const coachLookup = await fetch(
          `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&email=eq.${encodeURIComponent(normalEmail)}&select=id&limit=1`,
          { headers: h(), cache: "no-store" },
        );
        if (coachLookup.ok) {
          const coachLookupRows = await coachLookup.json();
          if (Array.isArray(coachLookupRows) && coachLookupRows.length > 0) {
            const coachId = (coachLookupRows[0] as { id: string }).id;
            await fetch(
              `${BASE}/rest/v1/team_coaches?id=eq.${encodeURIComponent(coachId)}`,
              {
                method:  "PATCH",
                headers: h({ Prefer: "return=minimal" }),
                body:    JSON.stringify({ account_id: accountId }),
              },
            );
          }
        }
      }
    } catch (err) {
      console.error("[onboard] elf_accounts link failed:", err);
    }
  })();

  // Fire-and-forget welcome email — failure never blocks onboarding.
  void (async () => {
    try {
      const teamName = [
        String(school_name ?? "").trim(),
        String(mascot     ?? "").trim(),
        String(sport_name ?? "").trim(),
      ].filter(Boolean).join(" ");
      const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "";
      await sendCoachWelcome({
        to:           String(coach_email).trim().toLowerCase(),
        coachName:    String(coach_name).trim(),
        teamName:     teamName || slug,
        loginUrl:     `${appBase}/login`,
        email:        String(coach_email).trim().toLowerCase(),
        tempPassword: pw,
        teamHubUrl:   `${appBase}/team/${slug}`,
      });
    } catch (err) {
      console.error("[onboard] sendCoachWelcome failed:", err);
    }
  })();

  // ── 3. team_join_codes (auto-generated) ───────────────────────────────────────
  const joinCode = generateJoinCode();
  await fetch(`${BASE}/rest/v1/team_join_codes`, {
    method:  "POST",
    headers: h({ Prefer: "return=minimal" }),
    body:    JSON.stringify({ campaign_slug: slug, code: joinCode }),
  });
  // Non-fatal: coach can regenerate in team settings if this fails.

  // ── 4. fund_uses (optional defaults) ─────────────────────────────────────────
  if (seed_fund_uses) {
    await Promise.all(
      DEFAULT_FUND_USES.map(fu =>
        fetch(`${BASE}/rest/v1/fund_uses`, {
          method:  "POST",
          headers: h({ Prefer: "return=minimal" }),
          body:    JSON.stringify({ campaign_slug: slug, ...fu }),
        }),
      ),
    );
  }

  // ── 5. athletes (optional starters) ──────────────────────────────────────────
  if (Array.isArray(starter_athletes) && starter_athletes.length > 0) {
    const valid = (starter_athletes as StarterAthlete[]).filter(
      a => typeof a.name === "string" && (a.name as string).trim(),
    );
    if (valid.length > 0) {
      await fetch(`${BASE}/rest/v1/athletes`, {
        method:  "POST",
        headers: h({ Prefer: "return=minimal" }),
        body:    JSON.stringify(
          valid.map(a => ({
            campaign_slug: slug,
            name:  (a.name  as string).trim(),
            event: (typeof a.event === "string" ? a.event : "").trim(),
          })),
        ),
      });
    }
  }

  return NextResponse.json({
    ok:          true,
    slug,
    join_code:   joinCode,
    coach_email: String(coach_email).trim().toLowerCase(),
  });
}
