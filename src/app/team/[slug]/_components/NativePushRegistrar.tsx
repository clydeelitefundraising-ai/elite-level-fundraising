"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getNativePlatform, registerNativeDeviceToken } from "@/lib/nativePushDevice";
import { startNativePushRegistration } from "@/lib/nativePushRegistration";

// Phase 10 / Phase 2C: native-only push registration + tap-routing bootstrap
// (APNs on iOS, FCM on Android) — sibling to ServiceWorkerRegistrar (the
// equivalent bootstrap for web push), mounted the same way in
// team/[slug]/layout.tsx. Never requests permission for browser/PWA users
// (gated on getNativePlatform(), the same Capacitor.isNativePlatform()
// convention NativeBootstrap.tsx already uses), and never prompts before the
// account is actually authenticated — an unauthenticated visitor would just
// get a 401 from POST /api/push/devices anyway, and prompting for
// notification permission before login is bad UX and not this app's pattern
// anywhere else.
//
// All decisions (permission flow, Android channel, tap routing, token
// rotation) live in src/lib/nativePushRegistration.ts so they are unit-tested.
//
// Re-mounts (and re-registers/re-attaches listeners) on every team page
// visit — harmless: registerPushDevice()'s upsert on
// (platform, device_token) makes a repeat registration of the same token
// a safe no-op refresh, not a duplicate row, and PushNotifications.
// register() is cheap/idempotent on the native side too. On Android the
// notification permission prompt is additionally limited to once per app
// session, so navigating between team pages never nags.
export default function NativePushRegistrar({ isAuthenticated }: { isAuthenticated: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) return;
    const platform = getNativePlatform();
    if (!platform) return;

    let cancelled = false;
    let removeListeners: (() => void) | undefined;

    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      removeListeners = await startNativePushRegistration({
        platform,
        plugin: PushNotifications,
        registerToken: registerNativeDeviceToken,
        navigate: url => router.push(url),
        isCancelled: () => cancelled,
      });
    })().catch(() => {
      // Never let push setup failures affect the rest of the app.
    });

    return () => {
      cancelled = true;
      removeListeners?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router identity is stable; re-running on every render would re-request permission
  }, [isAuthenticated]);

  return null;
}
