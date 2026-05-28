import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCoachSession } from "@/lib/teamSession";

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

// No confusable chars: no 0, 1, I, O
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

// GET — return active join code for this team (coach-only)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `${BASE}/rest/v1/team_join_codes?campaign_slug=eq.${encodeURIComponent(slug)}&revoked=eq.false&select=id,code,expires_at,created_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return NextResponse.json({ error: "Failed to fetch code." }, { status: 500 });

  const rows = await res.json();
  const active = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  // Treat expired as absent
  if (active?.expires_at && new Date(active.expires_at) < new Date()) {
    return NextResponse.json({ code: null });
  }
  return NextResponse.json({ code: active });
}

// POST — generate (or replace) the team join code (coach-only)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const newCode = generateCode();

  // Upsert on campaign_slug — replaces any existing row (active or revoked)
  const res = await fetch(
    `${BASE}/rest/v1/team_join_codes?on_conflict=campaign_slug`,
    {
      method: "POST",
      headers: h({ Prefer: "resolution=merge-duplicates,return=representation" }),
      body: JSON.stringify({ campaign_slug: slug, code: newCode, revoked: false }),
    },
  );

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to generate code: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  return NextResponse.json({ code: rows[0] });
}
