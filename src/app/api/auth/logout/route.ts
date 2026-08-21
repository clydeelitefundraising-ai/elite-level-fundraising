import { NextRequest, NextResponse } from "next/server";
import { getAccountSession } from "@/lib/accountSession";
import { deactivatePushDevice, type DevicePlatform } from "@/lib/pushDevices";

const VALID_PLATFORMS: DevicePlatform[] = ["ios", "android"];

// Phase 10: logout must deactivate ONLY the device that's actually logging
// out, not every device on the account (a person may have an iPhone, an
// iPad, and later Android — logging out on one must not silently stop
// push on the others). This previously cleared cookies with no read of
// the session first, so there was nothing to scope a deactivation to —
// now reads the account BEFORE the cookies are cleared below.
//
// device_token is optional: a browser logout (no registered native
// device) sends none, and this is a no-op with respect to push devices —
// only the cookie-clearing behavior below still applies, unchanged.
export async function POST(req: NextRequest) {
  const account = await getAccountSession();

  if (account) {
    const body = await req.json().catch(() => null);
    const platform = body?.platform;
    const deviceToken = body?.device_token;
    if (VALID_PLATFORMS.includes(platform) && typeof deviceToken === "string" && deviceToken.trim()) {
      await deactivatePushDevice(account.id, platform, deviceToken.trim());
    }
  }

  const res  = NextResponse.redirect(new URL("/login", req.url));
  const opts = {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path:     "/",
    maxAge:   0,
  };
  res.cookies.set("elf_session", "",  opts);
  res.cookies.set("team_coach",  "",  opts);
  res.cookies.set("team_member", "",  opts);
  return res;
}
