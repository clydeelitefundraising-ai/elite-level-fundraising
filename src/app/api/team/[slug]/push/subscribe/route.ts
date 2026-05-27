import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const { endpoint, keys } = body ?? {};

  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    typeof keys?.p256dh !== "string" ||
    typeof keys?.auth !== "string"
  ) {
    return NextResponse.json({ error: "Invalid subscription data." }, { status: 400 });
  }

  // Upsert on endpoint so re-subscribing the same browser doesn't create duplicates
  const res = await fetch(`${BASE}/rest/v1/push_subscriptions`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      campaign_slug: slug,
      platform: "web",
      endpoint,
      p256dh: keys.p256dh,
      auth_key: keys.auth,
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `DB error: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
