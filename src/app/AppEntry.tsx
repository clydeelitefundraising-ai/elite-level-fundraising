import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import type { EntryPhoto } from "@/components/auth/entryPhotos";
import styles from "@/components/auth/authEntry.module.css";

// Phase A36 — root pre-login landing screen (rendered by page.tsx when
// NEXT_PUBLIC_APP_URL is set, i.e. the Team App build only). Previously a
// bespoke navy/gold "Team Hub" screen predating A36; rebuilt on the same
// shared AuthShell used by every other A36 entry surface so it belongs to
// the same visual system instead of visually conflicting with it. Purely
// presentational — every link below points at exactly the same
// destination as before.
export default function AppEntry({ photo }: { photo: EntryPhoto }) {
  return (
    <AuthShell
      headline="Your Team. One Place."
      tagline="Stay connected. Raise more. Make the season count."
      photo={photo}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
        {/* Mobile only: the full branded headline/tagline — mobile never
            sees AuthShell's desktop panel, so this is the only place it
            appears there. Desktop shows a shorter functional heading
            instead (below), since the panel already carries this exact
            message right next to this card — showing both would just be
            a verbatim duplicate. Same pattern every other A36 view
            follows (e.g. LoginView's card heading is "Log In", not a
            repeat of the panel's "Welcome to ELF Team"). */}
        <div className={styles.hideOnDesktop}>
          <h1 className={styles.headline} style={{ fontSize: "1.6rem" }}>
            Your Team.<br />One Place.
          </h1>
          <span className={styles.underline} />
          <p className={styles.subtext} style={{ marginTop: ".85rem" }}>
            Stay connected. Raise more. Make the season count.
          </p>
        </div>
        <h1 className={`${styles.headline} ${styles.hideOnMobile}`} style={{ fontSize: "1.6rem" }}>
          Get Started
        </h1>

        <div style={{ display: "flex", flexDirection: "column", gap: ".75rem", marginTop: ".25rem" }}>
          <Link href="/login" className={styles.primaryButton}>
            Log In
          </Link>
          <Link href="/enter-code" className={styles.secondaryButton}>
            Enter Team Code
          </Link>
        </div>
      </div>

      <div className={styles.footerLinks} style={{ textAlign: "center" }}>
        <a href="/coach-login" className={styles.mutedLink}>
          Coach using old login? Continue with legacy coach login.
        </a>
      </div>
    </AuthShell>
  );
}
