import { NextRequest, NextResponse } from "next/server";
import { getAccountSession } from "@/lib/accountSession";
import { registerPushDevice, type DevicePlatform } from "@/lib/pushDevices";

const VALID_PLATFORMS: DevicePlatform[] = ["ios", "android"];

// Phase 10: account-level (not team-scoped) native push device
// registration. Auth via getAccountSession() — the same elf_session/
// account-level identity used for cross-team surfaces (Team Selector,
// account profile), not the per-team getTeamActor() pattern, since a
// device belongs to the person across every team/role they have.
//
// account_id is always server-derived from the session — the client only
// ever supplies platform + device_token, never an identity. The upsert in
// registerPushDevice() (UNIQUE(platform, device_token)) is what makes this
// single call correctly handle both "refresh my own device" and "transfer
// this device from whoever registered it last" — see pushDevices.ts.
export async function POST(req: NextRequest) {
  const account = await getAccountSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const platform = body?.platform;
  const deviceToken = body?.device_token;

  if (!VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "platform must be 'ios' or 'android'" }, { status: 400 });
  }
  if (typeof deviceToken !== "string" || !deviceToken.trim()) {
    return NextResponse.json({ error: "device_token is required" }, { status: 400 });
  }

  const result = await registerPushDevice(account.id, platform, deviceToken.trim());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
