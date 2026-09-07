import Link from "next/link";
import styles from "./Home.module.css";
import type { QuickAction } from "./coachDashboardHelpers";

/** Renders the dashboard's quick-action shortcuts — every item is a plain
 *  navigation Link into an existing page/workflow (see buildQuickActions
 *  in coachDashboardHelpers.ts); this component has no logic of its own
 *  beyond presentation. Compact, touch-friendly rows — no giant pills,
 *  no decorative icon treatment beyond the existing emoji glyphs. */
export default function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;

  return (
    <div className={styles.quickActions}>
      {actions.map(action => (
        <Link
          key={action.key}
          href={action.href}
          className="elf-list-row elf-focus-ring"
          style={{
            textDecoration: "none",
            color: "inherit",
            border: "1px solid var(--border-app)",
            borderRadius: "var(--radius-md)",
            minHeight: "var(--tap-target-min)",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: "1.1rem", flexShrink: 0 }}>{action.icon}</span>
          <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text-primary-app)" }}>{action.label}</span>
        </Link>
      ))}
    </div>
  );
}
