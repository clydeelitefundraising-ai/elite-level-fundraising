// The tiny same-origin postMessage protocol between /product's simulator
// controls (TeamAppSimulator) and the demo page in its phone frame
// (TeamAppDemo). Kept in its own dependency-free file so the marketing
// page never bundles the demo itself.

export type DemoRole = "coach" | "athlete" | "parent";
export const DEMO_ROLES: DemoRole[] = ["coach", "athlete", "parent"];

export const DEMO_MESSAGE_SOURCE = "elf-team-app-demo";

export type DemoMessage =
  | { source: typeof DEMO_MESSAGE_SOURCE; type: "role"; role: DemoRole }
  | { source: typeof DEMO_MESSAGE_SOURCE; type: "reset" }
  | { source: typeof DEMO_MESSAGE_SOURCE; type: "tab"; role: DemoRole; tab: string };

export const PREVIEW_ONLY = "Preview only — nothing is sent or saved.";

export const DEMO_PAGE_PATH = "/preview/team-app";

/** The Team App's bottom-nav destinations (TeamNav's hrefs), in order. */
export const DEMO_TAB_IDS = ["home", "communications", "calendar", "fundraiser", "shop", "team", "sponsors"];

/** Maps an intercepted /team/<slug>/… link to a demo tab, or null when the
 *  link leads somewhere the demo doesn't show (a preview-only notice). */
export function demoTabForHref(href: string): string | null {
  let path: string;
  try { path = new URL(href, "https://demo.invalid").pathname; } catch { return null; }
  const m = path.match(/^\/team\/[^/]+\/([^/?#]+)/);
  if (!m) return null;
  if (m[1] === "messages") return "communications";
  return DEMO_TAB_IDS.includes(m[1]) ? m[1] : null;
}

/** Which Communications section an intercepted link opens. /messages (the
 *  real app's redirect to the Messages section) and ?tab=messages open
 *  Messages; every other Comms link opens Updates. */
export function commsSectionForHref(href: string): "updates" | "messages" {
  let url: URL;
  try { url = new URL(href, "https://demo.invalid"); } catch { return "updates"; }
  if (/^\/team\/[^/]+\/messages(\/|$)/.test(url.pathname)) return "messages";
  return url.searchParams.get("tab") === "messages" ? "messages" : "updates";
}

/** A demo screen, from an intercepted /team/<slug>/… link (or a router
 *  push). Mirrors the real app's routes:
 *    /home /communications /calendar /fundraiser /shop /team /sponsors → tabs
 *    /messages               → Comms, Messages section (the app redirects)
 *    /team?tab=roster        → Team tab, Roster
 *    /attendance             → the coach attendance screen (no nav tab)
 *    /athlete/<id>           → an athlete's profile (member view, no nav tab)
 *    /team/<id>              → an athlete's profile (coach view, Team tab)
 *  Anything else (Requests, Notifications, other sites) → null. */
export type DemoRoute = {
  tab: string;
  screen: "main" | "attendance" | "athlete" | "coach-athlete";
  search: string;
  athleteId: string | null;
  commsSection: "updates" | "messages";
};

export function demoRouteForHref(href: string): DemoRoute | null {
  let url: URL;
  try { url = new URL(href, "https://demo.invalid"); } catch { return null; }
  if (url.origin !== "https://demo.invalid") return null;
  const m = url.pathname.match(/^\/team\/[^/]+\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!m) return null;
  const [, seg, rest] = m;
  const search = url.search.replace(/^\?/, "");
  const base = { search, athleteId: null, commsSection: commsSectionForHref(href) } as const;
  if (seg === "attendance" && !rest) return { ...base, tab: "team", screen: "attendance" };
  if (seg === "athlete" && rest) return { ...base, tab: "team", screen: "athlete", athleteId: rest };
  if (seg === "team" && rest) return { ...base, tab: "team", screen: "coach-athlete", athleteId: rest };
  if (rest) return null;
  const tab = demoTabForHref(href);
  return tab ? { ...base, tab, screen: "main" } : null;
}
