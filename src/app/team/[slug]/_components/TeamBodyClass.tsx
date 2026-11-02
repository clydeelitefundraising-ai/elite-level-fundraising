"use client";

import { useEffect } from "react";

/** Set on <body> while the Team App is mounted. */
export const TEAM_APP_BODY_CLASS = "elf-team-app";

// Marks <body> while the Team App is on screen, so design-system.css can
// give Team App modals — portalled to <body>, outside .elf-shell — 16px
// fields on every iOS version (the body:has(.elf-shell) rule needs iOS
// 15.4+; the app supports 15.0). Removed again when the Team App unmounts.
export default function TeamBodyClass() {
  useEffect(() => {
    document.body.classList.add(TEAM_APP_BODY_CLASS);
    return () => document.body.classList.remove(TEAM_APP_BODY_CLASS);
  }, []);
  return null;
}
