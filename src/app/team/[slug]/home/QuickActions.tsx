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
 *  ordinary links. Still no giant pills, minimum 44px tap target
 *  preserved. Final revision: icon is now a Lucide component (no emoji
 *  in primary product action UI), rendered at a consistent stroke
 *  weight/size across every tile regardless of action count. */
export default function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;

  return (
    <div className={styles.quickActions}>
      {actions.map(action => {
        const Icon = action.icon;
        return (
          <Link
            key={action.key}
            href={action.href}
            className={`elf-surface-card elf-focus-ring ${styles.actionTile}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <Icon aria-hidden="true" size={22} strokeWidth={2} color="var(--team-primary)" className={styles.actionIcon} />
            <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text-primary-app)" }}>{action.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
