# Phase 6 — Android (Capacitor Shell) Issue Tracker

Source: Batch 1B validation pass against `app-debug.apk` (Pixel_8_API_35 emulator, API 35), production URL `https://app.elitelevelfundraising.com`. No application code was touched during that pass — this document turns the findings into a scoped backlog.

Severity scale:
- **Critical** — crash, data loss, security exposure, or app-unusable.
- **High** — core flow broken or actively misleading the user, no crash.
- **Medium** — real defect, workaround exists or impact is bounded/unconfirmed.
- **Low** — polish, observability, or non-user-facing.

---

## ISSUE-4: Hydration mismatch (React error #418) on /settings

**Status: FIXED and production-verified.** Commit `050d671`, deployed to `elf-team-app` production (`app.elitelevelfundraising.com`), confirmed live via authenticated browser validation on desktop and mobile — see "Production verification" below.

**Severity:** Medium

**Source:** Discovered incidentally during Phase 6 Web Bridge Deployment Validation — live browser validation against production (`app.elitelevelfundraising.com`) after the Batch 2 push, not part of the original Batch 1B Android pass.

**Not caused by Phase 6 changes.** `SettingsView.tsx` was never touched by Batch 1B or Batch 2 (`MainActivity.java`, `AccountMenu.tsx`). The bug predates this phase's work; Phase 6 validation simply happened to be the first pass thorough enough to click into `/settings` with console-error capture.

**Observed:** `pageerror: Minified React error #418` fired specifically when navigating into `/settings`, on desktop viewport. Did not occur during any AccountMenu open/close/reopen cycle, login, or any other page in the validation pass. Mobile viewport did not reproduce it in that same pass (viewport doesn't affect this class of bug — likely timing/network-dependent on whether it surfaces visibly before hydration completes).

**Root cause (confirmed):** `SettingsView.tsx` line 27-29 (pre-fix) computed the shareable join link as:
```ts
const joinUrl = code
  ? (typeof window !== "undefined" ? `${window.location.origin}/join/${code.code}` : `/join/${code.code}`)
  : null;
```
Server-side render has no `window`, so it emits a relative path (`/join/CODE`) in the initial HTML. The browser's first hydration pass *does* have `window`, so React's client render computes an absolute URL (`https://.../join/CODE`) — different text than what's in the server HTML, which is exactly what triggers React error #418 (text hydration mismatch).

**Status history:** fix implemented → locally validated → approved → committed (`050d671`) → pushed → auto-deployed to production → production-verified. Complete.

**Fix:** Replaced the runtime `typeof window` branch with the codebase's existing build-time-inlined pattern (already used identically in `src/lib/campaignCreate.ts` and the coach-invite API route):
```ts
const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "";
const joinUrl = code ? `${appBase}/join/${code.code}` : null;
```
`NEXT_PUBLIC_*` vars are inlined as literal constants into both the server and client bundles at build time, so both renders now compute identical text by construction — no runtime environment branching left to diverge.

**Validation performed:**
- `npm run build`: clean, no errors
- Compiled-artifact check: grepped both the SSR chunk (`.next/server/chunks/ssr/...`) and the browser chunk (`.next/static/chunks/...`) for the `joinUrl` computation — both use the identical `process.env.NEXT_PUBLIC_APP_URL ?? ""` expression, zero occurrences of `typeof window` in either. Structurally proves the mismatch is eliminated for any environment/value of the env var.
- Live smoke check (local production server, Playwright, desktop + mobile): home, login, and an unauthenticated hit on `/settings` (correctly redirects to `/coach-login`, auth guard unaffected) — zero console errors/warnings.
- Full authenticated E2E click-through of `/settings` could not be run locally: the local `.env.local` connects to a different backend than production, so the QA credentials don't authenticate locally (same constraint discovered during Batch 2). The compiled-artifact proof above is the direct evidence for this specific bug class (a build-time constant is either identical between bundles or it isn't — verified it is).

**Estimated effort:** Low — single-expression fix, no new dependencies, no state/effect added.

**Risk:** Low. Narrow diff, existing established codebase pattern, no behavior change to join-link generation/revocation/copy logic — only how the URL string is computed.

**Blocking App Store?** No.

**Blocking production?** No longer — this was already live in production (auto-deployed with Batch 2's push) before it was even found. Recommend shipping the fix promptly since it's a real, reproducible hydration error on a live page, but it's not a functional blocker (the page still works; React recovers from #418 by discarding and re-rendering client-side).

**Production verification (post-deploy, commit `050d671`, authenticated Playwright run against `https://app.elitelevelfundraising.com`):**
- Two separate hard navigations to `/settings` (fresh load + reload) on desktop: zero console/page errors, no #418, no hydration warnings of any kind
- Same on mobile viewport (Pixel 7): zero console/page errors, no #418
- Displayed join URL: `https://app.elitelevelfundraising.com/join/KD7NSR` — correct absolute production domain, on both desktop and mobile
- "Copy Join Link" copies the identical complete absolute URL (verified via clipboard read)
- AccountMenu regression check (open, `window.__elfHasOpenOverlay()` true while open, closes on outside click) — all pass, unaffected by this fix
- Login and Home navigation before/after visiting Settings — no regressions
- 17/17 automated checks passed; full detail in the deployment validation report

---

## ISSUE-1: Hardware back button exits the app instead of closing open UI

**Status: FIXED (Batch 2).** See "Batch 2 resolution" below.

**Severity:** High

**Observed:** With the profile dropdown (Gary Jones / My Account / Team switcher menu) open, pressing the Android back button did not close the dropdown — it exited straight to the Android home screen, killing the app's foreground state.

**Root cause hypothesis:**
Capacitor's default Android back-button handling calls `webView.canGoBack()`; if the WebView has no in-page history entry to go back to, it falls through to the default behavior (exit/minimize the activity). The profile dropdown is almost certainly a client-side overlay/modal rendered without a corresponding history entry (no `pushState`/route change), so the WebView sees no back history and Capacitor's default handler exits the app. This pattern likely affects every modal/dropdown in the app, not just this one — Post Update, Add Event, Add Product, Add Athlete are all candidates until checked.

**Proposed implementation:**
Two viable approaches, either is acceptable:
1. **Native-side:** Register a custom `backButtonListener` in `MainActivity`/via `@capacitor/app`'s `App.addListener('backButton', ...)`. Have the web layer expose a "is a modal currently open" signal (e.g., a JS-callable check or a `CustomEvent`), and have the listener dismiss the modal instead of exiting when one is open; only fall through to exit at true app root.
2. **Web-side:** Ensure every modal/dropdown open pushes a history entry (or otherwise makes `canGoBack()` true) so Capacitor's default back handling naturally closes it first before ever reaching app-exit behavior.

Approach 2 is more consistent with how the rest of the SPA likely already handles routing, but requires auditing every overlay component. Approach 1 is a single choke point but requires a JS↔native bridge contract.

**Estimated effort:** Medium — 2–4 days. Not just the profile menu; requires auditing all modal/overlay surfaces in the web app to confirm scope, then implementing + regression-testing each.

**Risk:** Medium. Touches native shell code (`MainActivity`) and/or global modal state management on the web side. Risk of over-correcting and breaking legitimate "back = exit app" behavior at the true root screen.

**Blocking App Store?** Not a hard rejection reason for Google Play (this is Android-only; no iOS back-button equivalent), but it is the kind of defect Play Console's pre-launch report flags and that drives 1-star reviews. Treat as launch-blocking in practice, not in policy.

**Blocking production?** **Yes, recommended.** This is a core navigation defect reachable from the first authenticated screen a user sees (Team menu).

**Batch 2 resolution:**
Actual root cause (confirmed by reading the bundled `@capacitor/android` v8 sources): Capacitor's core Android library no longer implements *any* back-button handling on its own — `BridgeActivity`/`Bridge` have no `onBackPressed` override at all. With nothing overriding it, plain `Activity.onBackPressed()` calls `finish()`, destroying the activity outright regardless of what's open. This is a platform-level gap in Capacitor 8, not an app-specific bug.

Implemented the native-side approach (approach 1 above), scoped to the one confirmed case only:
- `android/app/src/main/java/com/elitelevelfundraising/team/MainActivity.java` overrides `onBackPressed()`. It asks the WebView (`evaluateJavascript`) whether `window.__elfHasOpenOverlay()` is true; if so, dispatches an `elfAndroidBackButton` JS event to close it; else falls back to `webView.goBack()` if history exists; else `moveTaskToBack(false)` (graceful backgrounding — process stays alive — instead of the old destructive `finish()`).
- `src/app/team/[slug]/_components/AccountMenu.tsx` sets `window.__elfHasOpenOverlay` while the profile dropdown is open and listens for the close event. No other modal/overlay in the app was touched, per scope.

**Discovered during validation:** `capacitor.config.ts`'s `server.url` means the Android shell always loads the *live production URL*, never the local bundle — so the AccountMenu.tsx half of this fix has no effect until it ships to `app.elitelevelfundraising.com`. Validated by temporarily pointing the shell at a local server (reverted before commit). Until that deploy happens, back-button presses over the profile dropdown fall through to the `goBack()`/`moveTaskToBack()` branch — which is not a regression: it already replaces the old destructive exit with graceful WebView-history navigation or backgrounding, confirmed against the real production APK. The dropdown-specific "close in place" behavior is additive value that activates on web deploy.

Full validation (build, back-button matrix across overlay/history/root states, logcat) recorded in the Batch 2 report.

---

## ISSUE-2: Session does not survive app restart

**Status: CLOSED as expected behavior (Batch 2 retest).** See "Batch 2 retest" below.

**Severity:** Medium (pending retest — may resolve to Low/no-issue or escalate to High)

**Observed:** After being forced to the Android home screen (via ISSUE-1) and relaunching the app, the user was returned to the Log In screen instead of the previously-authenticated team view. "Remember me for 30 days" was **not** checked during the test that produced this observation.

**Root cause hypothesis:**
Two competing explanations, not yet distinguished:
1. **Expected behavior:** Without "Remember me," the backend issues a session-only cookie. A full activity finish + relaunch is equivalent to a fresh browser session for a non-persistent cookie, so losing the session would be correct, not a bug.
2. **Real defect:** The Capacitor WebView's cookie jar isn't persisting *any* cookies (including the "remember me" 30-day cookie) across process restarts — e.g., `CookieManager` isn't flushing to disk, or the WebView server config evicts storage on activity destroy.

Cannot tell which is true without a controlled retest.

**Proposed implementation:**
1. Retest explicitly: log in with "Remember me for 30 days" checked, force-kill and relaunch, confirm whether session survives. This alone resolves the ambiguity.
2. If it still fails with "Remember me" checked: investigate `CookieManager.getInstance().setAcceptCookie(true)` / `.flush()` calls, whether `capacitor.config.ts`'s `server` block or Android `WebSettings` are constraining persistent storage, and whether the backend's "remember me" cookie has correct `Max-Age`/`Secure`/`SameSite` attributes for a WebView context.

**Estimated effort:** Low for the retest (<1 day). If a real fix is needed: Medium (1–3 days), since it touches auth/session and needs careful testing to avoid weakening session security while fixing persistence.

**Risk:** Low for retest. Medium if a fix is required — cookie/session handling is a security-sensitive surface.

**Blocking App Store?** No.

**Blocking production?** Potentially yes if confirmed real — forcing daily re-login for a coach/athlete-facing app used on the sideline is a significant adoption blocker. Status: **do not schedule a fix yet — retest first.**

**Batch 2 retest:**
Logged in with "Remember me for 30 days" checked, confirmed full authenticated navigation (Home → Choose Your Team → Home, tab switching), then force-killed the app via `adb shell am force-stop` (harder termination than the original ISSUE-1-triggered exit that produced this finding) and relaunched. Session persisted correctly — landed directly on the authenticated Team Selector, no re-login required. This confirms explanation 1 from the root-cause hypothesis above: without "Remember me," the backend issues a session-only cookie, and losing it on restart is correct behavior, not a defect. **Closed. No auth/cookie code was touched.**

---

## ISSUE-3: No WebView console/JS output observed in logcat

**Severity:** Low

**Observed:** Across the full validation pass (login, all 6 primary tabs, profile menu, back-button exit) zero `Capacitor/Console` or `chromium` console-log lines appeared in logcat. No JS errors were seen, but no confirmation that logging is even wired up.

**Root cause hypothesis:** Most likely explanation: the production site is a Next.js production build, which commonly strips `console.log` calls at build time (via `next.config.ts`'s compiler options or the React Compiler already present in this project's deps) — `console.error`/`console.warn` are typically preserved by default Next.js behavior, but if none fired, there's nothing to see. Less likely: Capacitor's console-to-logcat bridge or `WebView.setWebContentsDebuggingEnabled` isn't enabled in this debug build.

**Proposed implementation:** Not a functional bug — an observability gap that will make future debugging harder. Recommend explicitly confirming `setWebContentsDebuggingEnabled(true)` is active on debug builds and validating via `chrome://inspect` (remote DevTools) that console output is reachable independent of logcat, since logcat may simply never have been the intended channel.

**Estimated effort:** Low, <1 day.

**Risk:** Low.

**Blocking App Store?** No.

**Blocking production?** No.

---

## Severity Summary

| ID | Issue | Severity | Status |
|---|---|---|---|
| ISSUE-1 | Back button exits app instead of closing modal | High | **Fixed (Batch 2)** — native shell fixed and deployed; web half live in production as of commit `a54a1c8` |
| ISSUE-2 | Session doesn't survive restart | Medium (unconfirmed) | **Closed (Batch 2)** — confirmed expected behavior, no fix needed |
| ISSUE-3 | No WebView console output captured | Low | Open, deferred |
| ISSUE-4 | Hydration mismatch (#418) on /settings | Medium | **Fixed and production-verified** — commit `050d671` |

---

## Recommended Batch 2 Scope

Fix only the highest-value, confirmed items — do not spend Batch 2 on unconfirmed or cosmetic items.

**In scope for Batch 2:**
1. **ISSUE-1 fix** — implement back-button handling so it closes open modals/overlays before ever exiting the app. This is the only *confirmed* defect with clear production impact.
2. **ISSUE-2 retest only** (not a fix) — 10-minute manual retest with "Remember me" checked, to determine whether ISSUE-2 needs to become a real Batch 3 fix item or can be closed as expected behavior. Cheap to do now, and its outcome changes Batch 3 priority.

**Explicitly out of scope for Batch 2:**
- ISSUE-2 implementation fix (if retest confirms it's real, schedule as its own batch — it's a security-adjacent surface and deserves dedicated scope, not a rider on the back-button fix).
- ISSUE-3 — defer indefinitely, no user-facing impact, pick up opportunistically.
- Any modal/overlay other than the profile dropdown, beyond what's needed to confirm ISSUE-1's fix generalizes — full audit of every modal in the app is a separate follow-up once the chosen approach (native listener vs. history-state) is validated on the one confirmed case.

No code changes made in this document. Awaiting go-ahead before Batch 2 implementation begins.
