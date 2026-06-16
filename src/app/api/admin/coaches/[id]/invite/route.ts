import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { generateInviteToken, hashInviteToken, inviteExpiresAt } from "@/lib/coachInvite";
import { sendCoachInvite } from "@/lib/email";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Fetch the coach
  const coachRes = await fetch(
    `${BASE}/rest/v1/team_coaches?id=eq.${encodeURIComponent(id)}&select=id,name,email,campaign_slug&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!coachRes.ok) return NextResponse.json({ error: "Failed to look up coach." }, { status: 500 });
  const coachRows = await coachRes.json();
  if (!Array.isArray(coachRows) || coachRows.length === 0) {
    return NextResponse.json({ error: "Coach not found." }, { status: 404 });
  }
  const coach = coachRows[0] as { id: string; name: string; email: string; campaign_slug: string };

  // Fetch campaign name for the email
  const settingsRes = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(coach.campaign_slug)}&select=school_name,mascot,sport_name&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  let teamName = coach.campaign_slug;
  if (settingsRes.ok) {
    const rows = await settingsRes.json();
    if (Array.isArray(rows) && rows.length > 0) {
      const s = rows[0] as { school_name: string; mascot: string; sport_name: string };
      teamName = [s.school_name, s.mascot, s.sport_name].filter(Boolean).join(" ") || teamName;
    }
  }

  // Invalidate any prior unused tokens for this coach
  await fetch(
    `${BASE}/rest/v1/coach_invite_tokens?coach_id=eq.${encodeURIComponent(id)}&used_at=is.null`,
    {
      method:  "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ used_at: new Date().toISOString() }),
    },
  );

  // Generate new token
  const rawToken  = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = inviteExpiresAt();

  const insertRes = await fetch(`${BASE}/rest/v1/coach_invite_tokens`, {
    method:  "POST",
    headers: h({ Prefer: "return=minimal" }),
    body:    JSON.stringify({ coach_id: id, token_hash: tokenHash, expires_at: expiresAt }),
  });
  if (!insertRes.ok) {
    return NextResponse.json({ error: "Failed to generate invite token." }, { status: 500 });
  }

  const appBase   = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const inviteUrl = `${appBase}/coach-activate/${rawToken}`;

  // Best-effort email — failure does not block the response
  let emailSent = false;
  try {
    await sendCoachInvite({ to: coach.email, coachName: coach.name, teamName, inviteUrl });
    emailSent = true;
  } catch {
    // RESEND_API_KEY not configured or send failed — admin gets the URL to share manually
  }

  return NextResponse.json({ ok: true, inviteUrl, emailSent });
}
