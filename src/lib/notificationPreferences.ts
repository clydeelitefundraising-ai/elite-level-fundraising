// Phase 2E: pure helpers for the Notification Preferences settings UI, kept
// framework-free (no React) so they're unit-testable without a DOM harness —
// same pattern as nativePushRegistration.ts. Wraps the existing
// GET/PATCH /api/push/preferences contract; introduces no new endpoint or
// schema.

export type PushCategory = "team_updates" | "messages" | "calendar" | "requests";
export type Preferences = Record<PushCategory, boolean>;

export const PUSH_CATEGORIES: readonly PushCategory[] = ["team_updates", "messages", "calendar", "requests"];

/** Defaults any missing/non-boolean-false field to true, matching the
 *  server's own "ON by default" rule (getPushPreferences() in
 *  src/lib/pushDevices.ts) so a partial or malformed GET response can never
 *  be misread as every category being off. */
export function parsePreferencesResponse(json: unknown): Preferences {
  const obj = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const result = {} as Preferences;
  for (const key of PUSH_CATEGORIES) {
    result[key] = obj[key] !== false;
  }
  return result;
}

/** Returns the complete next-state object with exactly one category
 *  flipped. Always used as the PATCH body in full (never a partial
 *  {category: value} object): updatePushPreferences() upserts by spreading
 *  its own all-true defaults underneath whatever the caller sends, so a
 *  partial body would silently reset every other category back to true.
 *  Sending the complete known state every time avoids that without
 *  touching the shared preferences/sender library code. */
export function toggledPreferences(current: Preferences, key: PushCategory): Preferences {
  return { ...current, [key]: !current[key] };
}
