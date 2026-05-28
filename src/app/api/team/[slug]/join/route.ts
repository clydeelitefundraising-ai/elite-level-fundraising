import { NextRequest, NextResponse } from "next/server";
import { generateMemberSalt, makeMemberCookie } from "@/lib/memberAuth";

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const { code, name, role, phone, athlete_id } = body;

  if (!code?.trim()) {
    return NextResponse.json({ error: "Join code is required." }, { status: 400 });
  }
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (role !== "athlete" && role !== "parent") {
    return NextResponse.json({ error: "Role must be athlete or parent." }, { status: 400 });
  }

  const upperCode = code.trim().toUpperCase();

  // Validate the join code against this campaign
  const codeRes = await fetch(
    `${BASE}/rest/v1/team_join_codes?code=eq.${encodeURIComponent(upperCode)}&campaign_slug=eq.${encodeURIComponent(slug)}&revoked=eq.false&select=id,expires_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!codeRes.ok) {
    return NextResponse.json({ error: "Join failed. Please try again." }, { status: 500 });
  }

  const codeRows = await codeRes.json();
  if (!Array.isArray(codeRows) || codeRows.length === 0) {
    return NextResponse.json({ error: "Invalid or expired join code." }, { status: 400 });
  }
  const joinCode = codeRows[0];
  if (joinCode.expires_at && new Date(joinCode.expires_at) < new Date()) {
    return NextResponse.json({ error: "This join code has expired." }, { status: 400 });
  }

  const salt = generateMemberSalt();

  const memberBody: Record<string, unknown> = {
    campaign_slug: slug,
    role,
    name: name.trim(),
    salt,
  };
  if (phone?.trim()) memberBody.phone = phone.trim();
  // athlete_id links a parent to their athlete, or an athlete to their roster entry
  if (athlete_id && typeof athlete_id === "string") memberBody.athlete_id = athlete_id;

  const insertRes = await fetch(`${BASE}/rest/v1/team_members`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify(memberBody),
  });

  if (!insertRes.ok) {
    const msg = await insertRes.text();
    return NextResponse.json({ error: `Failed to create account: ${msg}` }, { status: 500 });
  }

  const members = await insertRes.json();
  const member = members[0];

  const cookieValue = makeMemberCookie(member.id, member.salt);

  const response = NextResponse.json({
    ok: true,
    campaign_slug: slug,
    member: { id: member.id, name: member.name, role: member.role },
  });

  response.cookies.set("team_member", cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
