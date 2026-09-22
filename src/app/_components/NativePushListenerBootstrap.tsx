"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getNativePlatform, registerNativeDeviceToken } from "@/lib/nativePushDevice";
import { attachNativePushListeners } from "@/lib/nativePushRegistration";

// Phase 2E: attaches the native push listeners (registration,
// registrationError, pushNotificationActionPerformed) once, for the life of
// the app, regardless of which route the app cold-starts into. Capacitor
// queues a cold-start launch notification tap and delivers it to whichever
// listener exists the first time the JS bridge fires the event after
// launch — it does not wait or retry later. Previously the only listener
// attachment lived inside NativePushRegistrar, mounted exclusively on an
// authenticated team/[slug] page; a multi-team account's cold start lands on
// /teams first, so that listener never existed yet and the tap was silently
// dropped ("No listeners found for event pushNotificationActionPerformed").
//
// Mounted in the root layout, beside NativeBootstrap, so it exists in the
// very first hydration commit on every cold start — /teams, /login,
// /team/[slug]/*, or any other route. Deliberately independent of
// authentication: attaching a listener has no auth requirement (only the
// separate permission/registration POST does, still gated in
// NativePushRegistrar), and tap navigation is safe to attempt from any
// route since the destination page enforces its own session check.
//
// This is the ONLY addListener call site for these three events in the app
// — NativePushRegistrar no longer attaches any listener itself (see its own
// header comment). Effect has an empty dependency array so it runs exactly
// once for the life of the app; it does not re-run on route or team changes,
// so listeners can never accumulate across navigation.
export function NativePushListenerBootstrap() {
  const router = useRouter();

  useEffect(() => {
    const platform = getNativePlatform();
    if (!platform) return;

    let cancelled = false;
    let removeListeners: (() => void) | undefined;

    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      removeListeners = await attachNativePushListeners({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once for the life of the app; router identity is stable
  }, []);

  return null;
}
