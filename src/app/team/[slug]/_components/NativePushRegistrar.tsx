"use client";

import { useEffect } from "react";
import { getNativePlatform } from "@/lib/nativePushDevice";
import { resolveNativePushPermissionAndRegister } from "@/lib/nativePushRegistration";

// Phase 10 / Phase 2C / Phase 2E: native-only push permission + registration
// bootstrap (APNs on iOS, FCM on Android). Never requests permission for
// browser/PWA users (gated on getNativePlatform(), the same
// Capacitor.isNativePlatform() convention NativeBootstrap.tsx already uses),
// and never prompts before the account is actually authenticated — an
// unauthenticated visitor would just get a 401 from POST /api/push/devices
// anyway, and prompting for notification permission before login is bad UX
// and not this app's pattern anywhere else.
//
// Phase 2E split this component: it used to also attach the native push
// listeners (registration/registrationError/pushNotificationActionPerformed),
// but that only ever mounted on an authenticated team page, so a cold-start
// notification tap landing on /teams (or /login, or any other route outside
// team/[slug]/*) fired to zero listeners and was silently dropped. Listener
// attachment now lives permanently in NativePushListenerBootstrap
// (src/app/_components/NativePushListenerBootstrap.tsx), mounted once in the
// root layout for the life of the app. This component now only ever resolves
// permission/channel/register() — see nativePushRegistration.ts for both
// halves.
//
// Re-mounts (and re-resolves permission/registers) on every team page visit
// — harmless: registerPushDevice()'s upsert on (platform, device_token)
// makes a repeat registration of the same token a safe no-op refresh, not a
// duplicate row, and PushNotifications.register() is cheap/idempotent on the
// native side too. On Android the notification permission prompt is
// additionally limited to once per app session, so navigating between team
// pages never nags.
export default function NativePushRegistrar({ isAuthenticated }: { isAuthenticated: boolean }) {
  useEffect(() => {
    if (!isAuthenticated) return;
    const platform = getNativePlatform();
    if (!platform) return;

    let cancelled = false;

    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await resolveNativePushPermissionAndRegister({
        platform,
        plugin: PushNotifications,
        isCancelled: () => cancelled,
      });
    })().catch(() => {
      // Never let push setup failures affect the rest of the app.
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return null;
}
