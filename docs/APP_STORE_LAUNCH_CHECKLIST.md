# ELF Team App — App Store Launch Checklist

Living document. Update the status column as work lands; don't delete rows —
mark them done with the commit/date so this stays a full record of what was
verified and when. Last updated: 2026-07-21 (Phase M2 start).

Status key: ☐ not started · 🔶 in progress · ✅ done · 🚫 deferred (intentional, with reason)

---

## Engineering — Android

| Item | Status | Notes |
|---|---|---|
| Package ID / applicationId | ✅ | `com.elitelevelfundraising.team` |
| minSdk / targetSdk / compileSdk | ✅ | 24 / 36 / 36 |
| Release signing | ✅ | `elf-team-release.keystore`, verified via `apksigner verify` (Phase M1) |
| App icon / adaptive icon | ✅ | Real branded assets, all densities |
| Splash screen | ✅ | Branded, `androidx.core:core-splashscreen` |
| Offline fallback page | ✅ | `errorPath: offline.html` (Phase 6) |
| Back button handling | ✅ | Custom `onBackPressed()`, closes overlays before exit (Phase 6) |
| Navigation whitelist scoped | ✅ | `allowNavigation` in `capacitor.config.ts` (Phase M1) |
| Status bar branding | ✅ | `@capacitor/status-bar`, verified live on Pixel 8 emulator — navy background, light icons |
| Dark mode (WebView force-dark) | ✅ | `android:forceDarkAllowed="false"`, verified live: light-theme login form stays correctly light with system dark mode forced on |
| Keyboard resize behavior | ✅ | `android:windowSoftInputMode="adjustResize"`, verified live: email field + Log In button stay visible above keyboard |
| App Links (`/join`, `/coach-activate`) | ✅ | `public/.well-known/assetlinks.json` + `autoVerify` intent-filter added, scoped to `/join` and `/coach-activate` prefixes only. Verified the JSON serves correctly with the release keystore's SHA-256. Live-device verification of the actual link-opens-app behavior needs a real signed install (Play-distributed or sideloaded release build), not yet done. |
| Native push (FCM) | 🚫 | Deferred until after first store release, per explicit decision |
| Orientation behavior verified | ✅ | Verified live: portrait↔landscape rotation, no crash, no reload (existing `configChanges` already covered this) |
| Background/resume verified | ✅ | Verified live: home button → relaunch, state/screen preserved |
| Session persistence verified | ✅ | Confirmed in Phase 6 (ISSUE-2, ok with "remember me") |
| Network interruption recovery | ✅ | Verified live on-device this session: airplane-mode cold launch → `offline.html`, reconnect → Retry recovers to real app |
| Safe-area handling | ✅ | `viewport-fit: cover`, verified Phase 6 Batch 3 |

## Engineering — iOS

| Item | Status | Notes |
|---|---|---|
| Xcode project exists | ✅ | Phase M1 (`npx cap add ios`) |
| Bundle ID | ✅ | `com.elitelevelfundraising.team` (matches Android for consistency) |
| App icon / launch image | ✅ | Real branded assets, generated from a corrected iOS-specific crop (see note below) |
| iOS deployment target | ✅ | 15.0 — current Capacitor default, reviewed, no change needed |
| Info.plist review (ATS, version, display name) | ✅ | Version 1.0/1 matches Android; `UIUserInterfaceStyle=Light` added; ATS already HTTPS-only by default, nothing to change |
| Status bar branding | ✅ | `@capacitor/status-bar` + `NativeBootstrap`, verified on Android device; iOS uses the same cross-platform plugin call, config-level only — cannot be visually confirmed without a Mac |
| Dark mode handling | ✅ | `UIUserInterfaceStyle=Light` in Info.plist (iOS equivalent of Android's `forceDarkAllowed=false`) |
| Safe-area handling | 🔶 | CSS-driven, should work for free — needs device/simulator confirmation on a Mac |
| Edge-swipe-back vs. in-app overlay conflict | ☐ | Phase M2.1 |
| Universal Links (`/join`, `/coach-activate`) | ☐ | **Blocked on Apple Team ID from you** — Android half done (see above); iOS needs `apple-app-site-association` (requires Team ID) + Associated Domains capability in Xcode |
| Apple Developer Program enrollment | ☐ | **Needed from you** — required before any TestFlight/App Store Connect work |
| Distribution certificate + provisioning profile | ☐ | Needs active Apple Developer account |
| Native push (APNs) | 🚫 | Deferred until after first store release |
| Real-device / simulator verification | ☐ | **Cannot be done from this (Windows) environment** — no Mac/Xcode/Simulator available here. Needs to happen on a Mac before submission. |

## Compliance

| Item | Status | Notes |
|---|---|---|
| Privacy Policy accurately describes Team App data | ✅ | Expanded Phase M3, live in production |
| Terms of Service accurately describes Team App | ✅ | Expanded Phase M3, live in production |
| Minimum-age / eligibility language | ✅ | Added Phase M3 |
| Messaging report/block mechanism (Apple 1.2 UGC) | ☐ | **Explicit decision: keep Messaging, build moderation before submission** — not started |
| App Privacy questionnaire answers drafted (Apple) | ☐ | Can be drafted once policy content is final — not started |
| Data Safety form answers drafted (Google) | ☐ | Same — not started |
| Age rating questionnaire answers | ☐ | Depends on messaging/moderation decision above |

## Store Assets (business/marketing-owned)

| Item | Status | Notes |
|---|---|---|
| App icon (1024×1024 master) | ✅ | Source exists (`assets/icon-*.png`) |
| Feature graphic (Play, 1024×500) | ☐ | Not created |
| Screenshots (both stores, all required sizes) | ☐ | Not created — needs a real, polished build to capture from |
| Promotional text / description / keywords | ☐ | Not written |
| Support URL (real page, not just mailto) | ☐ | Not created |
| Marketing URL | ✅ | `www.elitelevelfundraising.com` |
| Contact email | ✅ | `support@elitelevelfundraising.com` |

## Business / Accounts

| Item | Status | Notes |
|---|---|---|
| Apple Developer Program account | ☐ | **Needed from you** |
| Google Play Console account | ☐ | Needed from you (or confirm if already exists) |
| Play Console app listing created | ☐ | — |
| App Store Connect app record created | ☐ | Blocked on Apple Developer enrollment |

## Beta Testing (Phase M4 — not started)
Not begun. Explicitly out of scope until M2/M3 close out.

## Submission (Phase M5 — not started)
Not begun. Explicitly out of scope per current instructions.

---

## Findings needing attention

- **Google Play "hi-res icon" (512×512 store listing icon)**: `assets/icon-only.png` — the shared source used for iOS/PWA and previously assumed fine for any flat-icon context — has the same heavy padding issue found and fixed for iOS (see decision log). Android's *on-device* adaptive icon isn't affected (it's built from `icon-foreground.png`/`icon-background.png` with the OS's own auto-zoom mask), but the *Play Store listing* icon you'll upload separately in Play Console is a flat square image, same category of asset as the iOS one. Worth applying the same corrected-crop treatment (`assets/icon-only-ios.png` is a ready reference) when Play Store assets are prepared in Phase M3/M4 — not fixed now, out of this batch's scope (iOS parity only).

## Decision log
- **2026-07-21**: Keep Messaging in the mobile app; build a lightweight report-and-block system before submission rather than removing/hiding Messaging. (User decision, Phase M2 kickoff.)
- **2026-07-21**: Native push notifications deferred until after first store release — current Web Push implementation doesn't function inside Capacitor WebViews on either platform anyway, so this is a real feature gap being knowingly shipped without in v1, not a hidden one.
- **2026-07-21**: Dark mode — the app's CSS has no dark-mode variant anywhere (no `prefers-color-scheme` handling in `design-system.css`/`campaign.css`). Rather than let the OS/WebView algorithmically force-dark inline-styled content (which tends to produce broken, half-inverted UI), Phase M2 explicitly **disables** dark mode adaptation at the native layer on both platforms so the app always renders its intended light theme, regardless of system setting. This is a technical correctness fix, not a design decision — supporting real dark mode would be a future design project. Verified live on Android: forcing system dark mode leaves the light-themed login form correctly unaffected.
- **2026-07-21**: iOS app icon — the shared `assets/icon-only.png` source has heavy uniform padding baked in, correct for Android's adaptive-icon system (which auto-zooms ~1.5x when rendering the foreground layer) but not for iOS, which has no such masking and renders the full square as-is. Generated a separate, iOS-only crop (`assets/icon-only-ios.png`, same artwork, tighter framing — not a redesign) and used it only for iOS asset generation. Android's actual shipped assets (`icon-foreground.png`/`icon-background.png`) were not touched.
