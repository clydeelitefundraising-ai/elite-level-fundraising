"use client";

// Complete Season Phase 4 — what someone sees when the Complete Season preview
// isn't available to them (another role, or the feature is off). Rendered
// inside the team layout, so the team's navigation stays in place, with a
// way back. Deliberately generic: it doesn't say the preview exists, and no
// preview data is loaded for this view (the API refuses it independently).
import Link from "next/link";
import { useParams } from "next/navigation";
import styles from "./SeasonPreview.module.css";

export default function CompleteSeasonNotFound() {
  const params = useParams<{ slug: string }>();
  const slug = encodeURIComponent(params?.slug ?? "");
  return (
    <section className={styles.entry} aria-labelledby="season-not-available" data-testid="complete-season-not-available">
      <h1 id="season-not-available" className={styles.entryTitle}>This page isn&apos;t available</h1>
      <p className={styles.entryText}>
        You don&apos;t have access to this page with your current role, or it isn&apos;t turned on for this team.
      </p>
      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
        <Link href={`/team/${slug}/team`} className={styles.btn}>Back to Team</Link>
        <Link href={`/team/${slug}/home`} className={styles.btn}>Go to Home</Link>
      </div>
    </section>
  );
}
