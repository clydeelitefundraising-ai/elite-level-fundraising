"use client";

import { Capacitor } from "@capacitor/core";

// Phase 10: client-side persistence + registration for this installed
// app's own APNs device token, and the shared helpers that wire it into
// logout. Account-level, not team-scoped -- one native device token per
// installed app regardless of which team the user is currently viewing
// (mirrors usePushSubscription.ts's localStorage convention, e.g.
// `elf_push_<slug>`, but this key has no slug since push_devices is keyed
// on elf_accounts.id, not campaign_slug -- see pushDevices.ts).

const NATIVE_DEVICE_TOKEN_KEY = "elf_native_push_device_token";

export type NativeDevicePlatform = "ios" | "android";

/** True only inside the installed iOS app (never in a browser/PWA, and
 *  never on Android yet -- that platform's push setup is a future,
 *  separate phase; @capacitor/push-notifications is installed but never
 *  invoked there). */
export function isNativeIosApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export function getSavedNativeDeviceToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(NATIVE_DEVICE_TOKEN_KEY);
}

function saveNativeDeviceToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(NATIVE_DEVICE_TOKEN_KEY, token);
}

function clearSavedNativeDeviceToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(NATIVE_DEVICE_TOKEN_KEY);
}

/**
 * Registers this device's APNs token with the existing Phase 10 server API
 * (POST /api/push/devices — account-scoped via the session cookie, which
 * the installed app already carries since it loads the same origin the
 * cookie was set on). Saves the token locally regardless of whether the
 * POST succeeds: logout needs to know which token to deactivate even if
 * this attempt failed and hasn't been retried yet (the registrar re-fires
 * this on every team page mount, so a transient failure self-corrects).
 * Fails silently — push setup must never surface an error to the user or
 * block anything else, same philosophy as every other push write in this
 * codebase (see src/lib/apns.ts, src/lib/push.ts).
 */
export async function registerNativeDeviceToken(platform: NativeDevicePlatform, token: string): Promise<void> {
  saveNativeDeviceToken(token);
  try {
    await fetch("/api/push/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, device_token: token }),
    });
  } catch {
    // Silent — see function header.
  }
}

/**
 * Best-effort, device-specific logout. Sends this device's own saved
 * token (if any) to the EXISTING /api/auth/logout endpoint, which already
 * deactivates exactly that one (platform, device_token, account_id)
 * combination server-side — see api/auth/logout/route.ts. Deliberately
 * does not call the separate /api/push/devices/deactivate endpoint too;
 * that would be a second path to the same outcome. On the plain web/PWA
 * path (no saved token, isNativeIosApp() false everywhere this is called)
 * this sends the same request the existing SettingsView.tsx flow already
 * sent, just as an explicit JSON body instead of none — functionally
 * identical, since the server already tolerates a missing/empty body.
 *
 * Logout ALWAYS proceeds to /login regardless of whether the fetch
 * succeeds — a push-cleanup failure must never trap the user in a
 * logged-in state. Clears the locally saved token unconditionally too,
 * so a stale token is never reused to attempt registering a future,
 * different account's session against yesterday's device row.
 */
export async function performNativeAwareLogout(router: { push: (href: string) => void }): Promise<void> {
  const token = getSavedNativeDeviceToken();
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(token ? { platform: "ios", device_token: token } : {}),
    });
  } catch {
    // Silent — logout must still proceed below even if this failed.
  }
  clearSavedNativeDeviceToken();
  router.push("/login");
}
