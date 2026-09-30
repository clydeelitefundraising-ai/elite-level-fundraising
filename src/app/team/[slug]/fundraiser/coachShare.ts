// Phase 3A-1 QA fix: the navigator.share-vs-clipboard-fallback decision for
// CoachShareButton.tsx, pulled out into a plain (non-JSX) module so it can
// be unit tested with node:test directly — the test runner
// (`node --test src/**/*.test.ts`) has no JSX/TSX transform, so a .tsx
// component can't be imported from a test file. `target` stands in for
// `navigator` at the call site; tests pass a plain object instead of
// standing up a browser/jsdom harness.
export type ShareIntent = { title: string; text: string; url: string };

export interface ShareTarget {
  share?:     (data: ShareIntent) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

export type ShareOutcome = "shared" | "copied" | "noop";

// Mirrors AthleteView.handleShare()'s existing, already-shipped behavior in
// FundraiserView.tsx exactly: prefer navigator.share when present (a user
// cancelling the native share sheet is expected, not an error — same
// AbortError-is-fine convention as nativeFileShare.ts's shareFileOrFallback),
// otherwise fall back to copying the URL to the clipboard.
export async function shareCoachFundraiser(
  target: ShareTarget,
  intent: ShareIntent,
): Promise<ShareOutcome> {
  if (typeof target.share === "function") {
    try {
      await target.share(intent);
      return "shared";
    } catch {
      return "noop"; // user cancelled the share sheet
    }
  }
  if (target.clipboard) {
    try {
      await target.clipboard.writeText(intent.url);
      return "copied";
    } catch {
      return "noop";
    }
  }
  return "noop";
}
