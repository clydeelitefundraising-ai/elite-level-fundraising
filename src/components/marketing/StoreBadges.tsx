// Official App Store / Google Play badges for the ELF Team app.
//
// Both listings were verified live before use (2026-10-30): each opens the
// "ELF Team" app by Elite Level Fundraising LLC, package / bundle id
// com.elitelevelfundraising.team — the same id as capacitor.config.ts,
// android/app/build.gradle and the iOS project. Badge artwork is the
// unmodified official file from each store (public/marketing/badges/).
export const APP_STORE_URL = "https://apps.apple.com/us/app/elf-team/id6799780615";
export const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.elitelevelfundraising.team";

interface StoreBadgesProps {
  className?: string;
  /** "light" for dark backgrounds — the badges are black, so they get a thin outline there. */
  tone?: "dark" | "light";
}

export function StoreBadges({ className, tone = "dark" }: StoreBadgesProps) {
  return (
    <ul className={["mk-store-badges", tone === "light" ? "mk-store-badges-light" : "", className].filter(Boolean).join(" ")} aria-label="Download the free ELF Team app">
      <li>
        <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- official vector badge, used as supplied */}
          <img src="/marketing/badges/app-store-badge.svg" alt="Download the ELF Team app on the App Store" width={120} height={40} className="mk-store-badge-apple" />
        </a>
      </li>
      <li>
        <a href={GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- official badge, used as supplied (its own built-in padding is cropped by CSS) */}
          <img src="/marketing/badges/google-play-badge.png" alt="Get the ELF Team app on Google Play" width={646} height={250} className="mk-store-badge-google" />
        </a>
      </li>
    </ul>
  );
}
