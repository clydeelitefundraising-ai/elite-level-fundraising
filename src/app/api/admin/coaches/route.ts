import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { generateSalt, hashPassword } from "@/lib/teamAuth";
import { generateAccountSalt, hashAccountPassword, makeAccountCookie } from "@/lib/accountAuth";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { getCampaignSettings } from "@/lib/supabase";
import { sendCoachWelcome } from "@/lib/email";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function supabaseHeaders(extra?: Record<string, string>) {
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

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

  const res = await fetch(
    `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,email,role,campaign_slug,account_id,created_at&order=created_at.asc`,
    { headers: supabaseHeaders(), cache: "no-store" },
  );

  if (!res.ok) return NextResponse.json([]);
  const coaches = await res.json();
  if (!Array.isArray(coaches) || coaches.length === 0) return NextResponse.json([]);

  // Determine which coaches have a currently-active (unused, not-expired) invite token
  const ids = coaches.map((c: { id: string }) => c.id).join(",");
  const now = new Date().toISOString();
  const tokenRes = await fetch(
    `${BASE}/rest/v1/coach_invite_tokens?coach_id=in.(${ids})&used_at=is.null&expires_at=gt.${encodeURIComponent(now)}&select=coach_id`,
    { headers: supabaseHeaders(), cache: "no-store" },
  );
  const pendingIds = new Set<string>();
  if (tokenRes.ok) {
    const tokenRows = await tokenRes.json();
    if (Array.isArray(tokenRows)) {
      tokenRows.forEach((t: { coach_id: string }) => pendingIds.add(t.coach_id));
    }
  }

  return NextResponse.json(
    coaches.map((c: { id: string }) => ({ ...c, has_pending_invite: pendingIds.has(c.id) })),
  );
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { campaign_slug, name, email, role, password } = await req.json();

  if (!campaign_slug?.trim() || !name?.trim() || !email?.trim() || !password?.trim()) {
    return NextResponse.json(
      { error: "campaign_slug, name, email, and password are required." },
      { status: 400 },
    );
  }

  const salt = generateSalt();
  const password_hash = hashPassword(password.trim(), salt);

  const res = await fetch(`${BASE}/rest/v1/team_coaches`, {
    method: "POST",
    headers: supabaseHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify({
      campaign_slug: campaign_slug.trim(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: (["head_coach", "assistant_coach", "booster"] as const).includes(role) ? role : "head_coach",
      password_hash,
      salt,
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    if (msg.includes("23505") || msg.includes("unique")) {
      return NextResponse.json(
        { error: "A coach with this email already exists for this campaign." },
        { status: 409 },
      );
    }
    let detail = "Failed to create coach.";
    try { detail = (JSON.parse(msg) as { message?: string }).message ?? detail; } catch { /* raw text */ }
    return NextResponse.json({ error: detail }, { status: 500 });
  }

  const rows = await res.json();
  const coach = rows[0];

  // Create or link an elf_accounts row so this coach can use /login.
  let accountId: string | null = null;
  try {
    const normalEmail = email.trim().toLowerCase();

    // Check if an elf_account already exists for this email
    const existingRes = await fetch(
      `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(normalEmail)}&select=id&limit=1`,
      { headers: supabaseHeaders(), cache: "no-store" },
    );
    const existingRows = existingRes.ok ? await existingRes.json() : [];

    if (Array.isArray(existingRows) && existingRows.length > 0) {
      accountId = (existingRows[0] as { id: string }).id;
    } else {
      const acctSalt          = generateAccountSalt();
      const acctPasswordHash  = hashAccountPassword(password.trim(), acctSalt);
      const acctRes = await fetch(`${BASE}/rest/v1/elf_accounts`, {
        method:  "POST",
        headers: supabaseHeaders({ Prefer: "return=representation" }),
        body:    JSON.stringify({ email: normalEmail, name: name.trim(), password_hash: acctPasswordHash, salt: acctSalt }),
      });
      if (acctRes.ok) {
        const acctRows = await acctRes.json();
        accountId = (acctRows[0] as { id: string }).id;
      }
    }

    if (accountId) {
      await fetch(
        `${BASE}/rest/v1/team_coaches?id=eq.${encodeURIComponent(coach.id as string)}`,
        {
          method:  "PATCH",
          headers: supabaseHeaders({ Prefer: "return=minimal" }),
          body:    JSON.stringify({ account_id: accountId }),
        },
      );
    }
  } catch {
    // elf_accounts linking is best-effort; coach row is already created
  }

  // Fire-and-forget welcome email — failure never blocks coach creation.
  void (async () => {
    try {
      const settings = await getCampaignSettings(campaign_slug.trim()).catch(() => null);
      const teamName = settings
        ? `${settings.school_name} ${settings.mascot} ${settings.sport_name}`.trim()
        : campaign_slug.trim();
      const appBase = process.env.VERCEL_ENV === "production"
        ? (process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin)
        : new URL(req.url).origin;
      await sendCoachWelcome({
        to:           email.trim().toLowerCase(),
        coachName:    name.trim(),
        teamName,
        loginUrl:     `${appBase}/login`,
        email:        email.trim().toLowerCase(),
        tempPassword: password.trim(),
        teamHubUrl:   `${appBase}/team/${campaign_slug.trim()}`,
      });
    } catch (err) {
      console.error("[coaches] sendCoachWelcome failed:", err);
    }
  })();

  logAuditEvent({
    action:        "coach.added",
    entity_type:   "coach",
    entity_id:     coach.id as string,
    campaign_slug: campaign_slug.trim(),
    summary:       `Added coach "${name.trim()}" (${email.trim().toLowerCase()}, ${(["head_coach", "assistant_coach", "booster"] as const).includes(role) ? role : "head_coach"}) to ${campaign_slug.trim()}`,
    new_value:     { name: name.trim(), email: email.trim().toLowerCase(), role: (["head_coach", "assistant_coach", "booster"] as const).includes(role) ? role : "head_coach", campaign_slug: campaign_slug.trim() },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  return NextResponse.json({
    id:                 coach.id,
    campaign_slug:      coach.campaign_slug,
    name:               coach.name,
    email:              coach.email,
    role:               coach.role,
    account_id:         accountId,
    has_pending_invite: false,
    created_at:         coach.created_at,
  });
}
