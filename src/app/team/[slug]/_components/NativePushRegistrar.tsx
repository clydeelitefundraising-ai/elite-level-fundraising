"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNativeIosApp, registerNativeDeviceToken } from "@/lib/nativePushDevice";
import { isSafeInternalPath } from "@/lib/internalUrl";

// Phase 10: native-only APNs registration + tap-routing bootstrap —
// sibling to ServiceWorkerRegistrar (the equivalent bootstrap for web
// push), mounted the same way in team/[slug]/layout.tsx. Never requests
// permission for browser/PWA users (gated on isNativeIosApp(), same
// Capacitor.isNativePlatform() convention NativeBootstrap.tsx already
// uses), and never prompts before the account is actually authenticated —
// an unauthenticated visitor would just get a 401 from POST
// /api/push/devices anyway, and prompting for notification permission
// before login is bad UX and not this app's pattern anywhere else.
//
// Re-mounts (and re-registers/re-attaches listeners) on every team page
// visit — harmless: registerPushDevice()'s upsert on
// (platform, device_token) makes a repeat registration of the same token
// a safe no-op refresh, not a duplicate row, and PushNotifications.
// register() is cheap/idempotent on the native side too.
export default function NativePushRegistrar({ isAuthenticated }: { isAuthenticated: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!isNativeIosApp()) return;

    let cancelled = false;
    let removeListeners: (() => void) | undefined;

    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      const [regHandle, errHandle, tapHandle] = await Promise.all([
        PushNotifications.addListener("registration", token => {
          if (cancelled) return;
          void registerNativeDeviceToken("ios", token.value);
        }),
        // Silent — matches this app's existing push-failure philosophy
        // (see apns.ts/push.ts): setup failures never surface to the user.
        PushNotifications.addListener("registrationError", () => {}),
        // Tap routing — covers foreground, background, and cold-start taps
        // uniformly (Capacitor queues a cold-start launch notification and
        // delivers it to this same listener once it's registered). Only
        // ever navigates to a same-origin relative path already validated
        // by isSafeInternalPath — an external/malformed url is silently
        // ignored, never followed.
        PushNotifications.addListener("pushNotificationActionPerformed", action => {
          if (cancelled) return;
          const url = action.notification?.data?.url;
          if (isSafeInternalPath(url)) router.push(url);
        }),
      ]);
      removeListeners = () => {
        void regHandle.remove();
        void errHandle.remove();
        void tapHandle.remove();
      };

      let status = await PushNotifications.checkPermissions();
      if (status.receive === "prompt") {
        status = await PushNotifications.requestPermissions();
      }
      if (status.receive !== "granted") return;

      await PushNotifications.register();
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
