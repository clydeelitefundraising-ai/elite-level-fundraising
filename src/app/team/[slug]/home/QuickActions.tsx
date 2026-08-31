import Link from "next/link";
import styles from "./Home.module.css";
import type { QuickAction } from "./coachDashboardHelpers";

/** Renders the dashboard's quick-action shortcuts — every item is a plain
 *  navigation Link into an existing page/workflow (see buildQuickActions
 *  in coachDashboard.ts); this component has no logic of its own beyond
 *  presentation. */
export default function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;

  return (
    <div className={styles.quickActions}>
      {actions.map(action => (
        <Link
          key={action.key}
          href={action.href}
          style={{
            display: "flex", alignItems: "center", gap: ".65rem",
            background: "#fff", borderRadius: 14, padding: ".9rem 1rem",
            textDecoration: "none",
            boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: "1.3rem", flexShrink: 0 }}>{action.icon}</span>
          <span style={{ fontWeight: 700, fontSize: ".88rem", color: "#0b1e3d" }}>{action.label}</span>
        </Link>
      ))}
    </div>
  );
}
