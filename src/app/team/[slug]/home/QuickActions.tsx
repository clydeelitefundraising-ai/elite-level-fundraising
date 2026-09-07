import Link from "next/link";
import styles from "./Home.module.css";
import type { QuickAction } from "./coachDashboardHelpers";

/** Renders the dashboard's quick-action shortcuts — every item is a plain
 *  navigation Link into an existing page/workflow (see buildQuickActions
 *  in coachDashboardHelpers.ts); this component has no logic of its own
 *  beyond presentation.
 *
 *  Phase 4 revision: icon-forward tiles (icon stacked above label,
 *  centered) instead of left-aligned text rows — per the explicit
 *  feedback that these should "feel like real dashboard controls," not
 *  ordinary links. Still no giant pills, no decorative icon treatment
 *  beyond the existing emoji glyphs, minimum 44px tap target preserved. */
export default function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;

  return (
    <div className={styles.quickActions}>
      {actions.map(action => (
        <Link
          key={action.key}
          href={action.href}
          className={`elf-surface-card elf-focus-ring ${styles.actionTile}`}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <span aria-hidden="true" className={styles.actionIcon}>{action.icon}</span>
          <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text-primary-app)" }}>{action.label}</span>
        </Link>
      ))}
    </div>
  );
}
