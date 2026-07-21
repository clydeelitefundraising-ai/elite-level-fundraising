"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

// Runs once on native platforms only (no-op in the browser). Brands the
// status bar to match the app's dark navy theme instead of leaving it at
// the OS default, and keeps it non-overlaying since safe-area insets
// (viewport-fit: cover, layout.tsx) already reserve space for it.
export function NativeBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    StatusBar.setBackgroundColor({ color: "#0b1e3d" }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  }, []);

  return null;
}
