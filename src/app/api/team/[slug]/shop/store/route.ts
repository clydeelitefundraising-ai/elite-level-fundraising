import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { updateCampaignSettings } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { external_store_url, store_provider } = await req.json();

  try {
    await updateCampaignSettings(slug, {
      external_store_url: external_store_url ?? null,
      store_provider:     store_provider     ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update store settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
