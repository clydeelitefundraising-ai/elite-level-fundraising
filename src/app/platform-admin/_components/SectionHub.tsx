import Link from "next/link";
import type { AdminNavItem, AdminNavSection } from "@/lib/platformAdminNav";
import styles from "./SectionHub.module.css";

// One Platform Admin section: its tools as cards, from
// src/lib/platformAdminNav.ts. Legacy /admin tools are labelled; a signed-in
// Platform Admin opens them without the shared password.

export function ToolCard({ item }: { item: AdminNavItem }) {
  return (
    <li>
      <Link href={item.href} className={styles.card} prefetch={item.legacy ? false : undefined}>
        <span className={styles.cardTitle}>
          {item.label}
          {item.legacy && <span className={styles.legacy}>Legacy admin</span>}
        </span>
        <span className={styles.cardText}>{item.description}</span>
      </Link>
    </li>
  );
}

export function ToolGrid({ items }: { items: readonly AdminNavItem[] }) {
  return (
    <ul className={styles.grid}>
      {items.map(item => <ToolCard key={`${item.href}|${item.label}`} item={item} />)}
    </ul>
  );
}

export default function SectionHub({ section, children }: { section: AdminNavSection; children?: React.ReactNode }) {
  return (
    <div>
      <h1 className={styles.title}>{section.label}</h1>
      <p className={styles.summary}>{section.summary}</p>
      {children}
      <ToolGrid items={section.items} />
      {section.items.some(i => i.legacy) && (
        <p className={styles.note}>
          Tools marked &ldquo;Legacy admin&rdquo; still open in the original admin portal while they move here.
          You won&apos;t need the shared admin password.
        </p>
      )}
    </div>
  );
}
