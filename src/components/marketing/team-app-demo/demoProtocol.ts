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
