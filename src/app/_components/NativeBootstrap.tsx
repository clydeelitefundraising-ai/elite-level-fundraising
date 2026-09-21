"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { isAndroidNativeApp } from "@/lib/androidFileBridge";

// Runs once on native platforms only (no-op in the browser). Brands the
// status bar to match the app's dark navy theme instead of leaving it at
// the OS default, and keeps it non-overlaying since safe-area insets
// (viewport-fit: cover, layout.tsx) already reserve space for it.
export function NativeBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});

    if (isAndroidNativeApp()) {
      // Android 15/16 draw the app edge-to-edge and ignore setBackgroundColor: the bar shows the
      // window (DayNight theme) background, so forcing Style.Dark (white icons) gave white-on-light
      // icons in light mode. Style.Default follows the theme (dark icons on a light bar, light icons
      // on a dark bar). Style goes first so, on Android 14 and below where the navy color still
      // applies, the plugin derives icon color from that color's luminance.
      StatusBar.setStyle({ style: Style.Default })
        .catch(() => {})
        .then(() => StatusBar.setBackgroundColor({ color: "#0b1e3d" }))
        .catch(() => {});
      return;
    }

    StatusBar.setBackgroundColor({ color: "#0b1e3d" }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  }, []);

  return null;
}
