import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const { endpoint } = body ?? {};

  if (typeof endpoint !== "string") {
    return NextResponse.json({ error: "endpoint required." }, { status: 400 });
  }

  await fetch(
    `${BASE}/rest/v1/push_subscriptions?campaign_slug=eq.${encodeURIComponent(slug)}&endpoint=eq.${encodeURIComponent(endpoint)}`,
    {
      method: "DELETE",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    },
  );

  return NextResponse.json({ ok: true });
}
