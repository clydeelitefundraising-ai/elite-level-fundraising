import { NextRequest, NextResponse } from "next/server";
import { getAccountSession } from "@/lib/accountSession";
import { deactivatePushDevice, type DevicePlatform } from "@/lib/pushDevices";

const VALID_PLATFORMS: DevicePlatform[] = ["ios", "android"];

// Phase 10: deactivates ONE device — never every device belonging to the
// account. account_id is always server-derived from the session, never
// trusted from the client; the client only supplies the token identifying
// WHICH of its own devices to deactivate. deactivatePushDevice()'s WHERE
// clause requires platform + device_token + account_id all matching the
// same row, so a caller can never deactivate a device it doesn't own even
// if it somehow supplied someone else's token — that combination simply
// matches zero rows. Used by the logout route below, and available as a
// standalone endpoint for a future in-app "manage devices" setting.
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

  await deactivatePushDevice(account.id, platform, deviceToken.trim());
  return NextResponse.json({ ok: true });
}
