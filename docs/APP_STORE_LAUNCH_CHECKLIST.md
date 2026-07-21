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
| Status bar branding | 🔶 | Phase M2 |
| Dark mode (WebView force-dark) | 🔶 | Phase M2 — disabling, not supporting (see decision log) |
| Keyboard resize behavior | 🔶 | Phase M2 |
| App Links (`/join`, `/coach-activate`) | ☐ | Phase M2.3 — blocked on nothing for Android half, but doing iOS+Android together |
| Native push (FCM) | 🚫 | Deferred until after first store release, per explicit decision |
| Orientation behavior verified | 🔶 | Phase M2 |
| Background/resume verified | 🔶 | Phase M2 |
| Session persistence verified | ✅ | Confirmed in Phase 6 (ISSUE-2, ok with "remember me") — re-verifying in M2 |
| Network interruption recovery | ✅ | `offline.html` covers this (Phase 6) — re-verifying in M2 |
| Safe-area handling | ✅ | `viewport-fit: cover`, verified Phase 6 Batch 3 |

## Engineering — iOS

| Item | Status | Notes |
|---|---|---|
| Xcode project exists | ✅ | Phase M1 (`npx cap add ios`) |
| Bundle ID | ✅ | `com.elitelevelfundraising.team` (matches Android for consistency) |
| App icon / launch image | 🔶 | Phase M2 — currently Capacitor defaults, needs real assets |
| iOS deployment target | ☐ | Needs review during M2.1 |
| Info.plist review (ATS, version, display name) | 🔶 | Phase M2 |
| Status bar branding | 🔶 | Phase M2 |
| Dark mode handling | 🔶 | Phase M2 — disabling, not supporting |
| Safe-area handling | 🔶 | Should work for free (CSS-driven), needs device/simulator confirmation |
| Edge-swipe-back vs. in-app overlay conflict | ☐ | Phase M2.1 |
| Universal Links (`/join`, `/coach-activate`) | ☐ | Phase M2.3 — **blocked on Apple Team ID from you** |
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

## Decision log
- **2026-07-21**: Keep Messaging in the mobile app; build a lightweight report-and-block system before submission rather than removing/hiding Messaging. (User decision, Phase M2 kickoff.)
- **2026-07-21**: Native push notifications deferred until after first store release — current Web Push implementation doesn't function inside Capacitor WebViews on either platform anyway, so this is a real feature gap being knowingly shipped without in v1, not a hidden one.
- **2026-07-21**: Dark mode — the app's CSS has no dark-mode variant anywhere (no `prefers-color-scheme` handling in `design-system.css`/`campaign.css`). Rather than let the OS/WebView algorithmically force-dark inline-styled content (which tends to produce broken, half-inverted UI), Phase M2 explicitly **disables** dark mode adaptation at the native layer on both platforms so the app always renders its intended light theme, regardless of system setting. This is a technical correctness fix, not a design decision — supporting real dark mode would be a future design project.
