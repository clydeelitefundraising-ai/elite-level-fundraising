"use client";

import { Capacitor } from "@capacitor/core";
import { registerDeviceTokenWithRotation } from "./nativePushRegistration.ts";

// Phase 10: client-side persistence + registration for this installed
// app's own APNs device token, and the shared helpers that wire it into
// logout. Account-level, not team-scoped -- one native device token per
// installed app regardless of which team the user is currently viewing
// (mirrors usePushSubscription.ts's localStorage convention, e.g.
// `elf_push_<slug>`, but this key has no slug since push_devices is keyed
// on elf_accounts.id, not campaign_slug -- see pushDevices.ts).

const NATIVE_DEVICE_TOKEN_KEY = "elf_native_push_device_token";

export type NativeDevicePlatform = "ios" | "android";

/** True only inside the installed iOS app (never in a browser/PWA and never
 *  on Android). Push registration itself now goes through getNativePlatform()
 *  so Android registers for FCM too; this stays for iOS-only call sites. */
export function isNativeIosApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

/** Pure mapping from Capacitor's (isNativePlatform, getPlatform) to the
 *  push_devices platform, or null for a browser/PWA or any other host.
 *  Split out so the native branches are testable without a Capacitor
 *  runtime. */
export function resolveNativePlatform(isNative: boolean, platform: string): NativeDevicePlatform | null {
  if (!isNative) return null;
  return platform === "ios" || platform === "android" ? platform : null;
}

/** The installed app's own platform ("ios" | "android"), or null on the
 *  web. Used by logout so a device token is always deactivated under the
 *  platform it was registered with. */
export function getNativePlatform(): NativeDevicePlatform | null {
  return resolveNativePlatform(Capacitor.isNativePlatform(), Capacitor.getPlatform());
}

/** True inside either installed app (iOS or Android), never on the web.
 *  Gates the native-aware logout. */
export function isNativeApp(): boolean {
  return getNativePlatform() !== null;
}

/** Body for POST /api/auth/logout: the device's own (platform, token) pair
 *  when both are known, else an empty object (the server tolerates it). */
export function buildLogoutBody(
  platform: NativeDevicePlatform | null,
  token: string | null,
): { platform: NativeDevicePlatform; device_token: string } | Record<string, never> {
  return platform && token ? { platform, device_token: token } : {};
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
 * Registers this device's push token (APNs on iOS, FCM on Android) with the existing Phase 10 server API
 * (POST /api/push/devices — account-scoped via the session cookie, which
 * the installed app already carries since it loads the same origin the
 * cookie was set on). Saves the token locally regardless of whether the
 * POST succeeds: logout needs to know which token to deactivate even if
 * this attempt failed and hasn't been retried yet (the registrar re-fires
 * this on every team page mount, so a transient failure self-corrects).
 * Fails silently — push setup must never surface an error to the user or
 * block anything else, same philosophy as every other push write in this
 * codebase (see src/lib/apns.ts, src/lib/push.ts). On Android, when FCM
 * rotates the token, the previously saved token is deactivated after the new
 * one registers (see registerDeviceTokenWithRotation).
 */
export async function registerNativeDeviceToken(platform: NativeDevicePlatform, token: string): Promise<void> {
  await registerDeviceTokenWithRotation(platform, token, {
    getSaved: getSavedNativeDeviceToken,
    save: saveNativeDeviceToken,
    post: async (path, body) => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok;
    },
  });
}

/**
 * Best-effort, device-specific logout. Sends this device's own saved
 * token (if any) to the EXISTING /api/auth/logout endpoint, which already
 * deactivates exactly that one (platform, device_token, account_id)
 * combination server-side — see api/auth/logout/route.ts. Deliberately
 * does not call the separate /api/push/devices/deactivate endpoint too;
 * that would be a second path to the same outcome. On the plain web/PWA
 * path (no saved token, isNativeApp() false everywhere this is called)
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
      body: JSON.stringify(buildLogoutBody(getNativePlatform(), token)),
    });
  } catch {
    // Silent — logout must still proceed below even if this failed.
  }
  clearSavedNativeDeviceToken();
  router.push("/login");
}
