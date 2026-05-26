import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { generateSalt, hashPassword } from "@/lib/teamAuth";

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
    `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,email,role,campaign_slug,created_at&order=created_at.asc`,
    { headers: supabaseHeaders(), cache: "no-store" },
  );

  if (!res.ok) return NextResponse.json([]);
  return NextResponse.json(await res.json());
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
      role: role === "assistant_coach" ? "assistant_coach" : "head_coach",
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
  return NextResponse.json({
    id: coach.id,
    campaign_slug: coach.campaign_slug,
    name: coach.name,
    email: coach.email,
    role: coach.role,
    created_at: coach.created_at,
  });
}
