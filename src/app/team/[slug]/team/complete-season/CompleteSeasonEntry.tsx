// Complete Season Phase 3 — the entry point under the To-Do List (Team →
// To-Do). Rendered only when the preview flag is on and the viewer is the
// Head Coach or a platform admin (decided by the server page).
import Link from "next/link";
import styles from "./SeasonPreview.module.css";

export default function CompleteSeasonEntry({ slug }: { slug: string }) {
  return (
    <section className={styles.entry} aria-labelledby="complete-season-entry">
      <h2 id="complete-season-entry" className={styles.entryTitle}>Complete Season</h2>
      <p className={styles.entryText}>
        When this season ends, completing it archives the current season as read-only history and immediately
        activates the next one: seniors graduate, everyone else moves up a grade, and families and staff carry over.
      </p>
      <Link href={`/team/${encodeURIComponent(slug)}/team/complete-season`} className={styles.btn}>
        Preview completing this season
      </Link>
    </section>
  );
}
