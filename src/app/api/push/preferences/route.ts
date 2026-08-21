import { NextRequest, NextResponse } from "next/server";
import { getAccountSession } from "@/lib/accountSession";
import { getPushPreferences, updatePushPreferences } from "@/lib/pushDevices";

// Phase 10: account-level push preferences (Team Updates / Messages /
// Calendar / Requests, default ON). Account-scoped via getAccountSession(),
// consistent with the device registration routes above — preferences
// apply to the person, not one team.
export async function GET() {
  const account = await getAccountSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prefs = await getPushPreferences(account.id);
  return NextResponse.json(prefs);
}

export async function PATCH(req: NextRequest) {
  const account = await getAccountSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const patch: Record<string, boolean> = {};
  for (const key of ["team_updates", "messages", "calendar", "requests"] as const) {
    if (typeof body[key] === "boolean") patch[key] = body[key];
  }

  const result = await updatePushPreferences(account.id, patch);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
