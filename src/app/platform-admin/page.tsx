import Link from "next/link";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { getAdminDashboardData } from "@/lib/platform/adminDashboard";
import { attentionToShow } from "@/lib/platform/adminDashboardView";
import { getPeopleStats } from "@/lib/platform/peopleStats";
import styles from "./_components/Dashboard.module.css";

export const dynamic = "force-dynamic";

// Legacy /admin tools are still separate routes; Next must not prefetch
// them from here (each is its own authorized page load).
const noPrefetch = (href: string) => (href.startsWith("/admin") ? false : undefined);

const QUICK_ACTIONS = [
  { label: "School Links", href: "/platform-admin/school-links", icon: "⇄" },
  { label: "Campaigns", href: "/admin/campaigns", icon: "◫" },
  { label: "Partners", href: "/admin/community-partners", icon: "◇" },
  { label: "Audit Log", href: "/admin/audit", icon: "☰" },
];

// /platform-admin — the Platform Admin dashboard and post-login landing
// page. The layout has already verified the Platform Admin account; every
// number and item here comes from the existing readers in
// src/lib/platform/adminDashboard.ts (display rules: adminDashboardView.ts).
export default async function PlatformAdminDashboardPage() {
  const [admin, data, people] = await Promise.all([getPlatformAdminSession(), getAdminDashboardData(), getPeopleStats()]);
  const { counts, activity } = data;
  const show = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US"));
  const stats: { label: string; value: string; href: string; alert: boolean; note?: string; wide?: boolean }[] = [
    {
      label: "People on ELF", value: show(people ? people.allTime.total : null), href: "/platform-admin/people", alert: false, wide: true,
      note: people ? `${people.current.total.toLocaleString("en-US")} in current seasons` : undefined,
    },
    { label: "Open reports", value: show(counts.openReports), href: "/platform-admin/moderation", alert: (counts.openReports ?? 0) > 0 },
    { label: "New inquiries", value: show(counts.newInquiries), href: "/platform-admin/fundraising-inquiries", alert: (counts.newInquiries ?? 0) > 0 },
    { label: "Schools", value: show(counts.schools), href: "/platform-admin/schools", alert: false },
    { label: "Team-seasons", value: show(counts.teamSeasons), href: "/admin/campaigns", alert: false },
  ];
  const attention = attentionToShow(data.attention);
  const firstName = admin?.name?.trim().split(/\s+/)[0];

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1 className={styles.title}>{firstName ? `Welcome, ${firstName}` : "Dashboard"}</h1>
        <p className={styles.subtitle}>Today across ELF</p>
      </header>

      <ul className={styles.kpis} aria-label="At a glance">
        {stats.map(s => (
          <li key={s.label} className={s.wide ? styles.kpiWide : undefined}>
            <Link href={s.href} prefetch={noPrefetch(s.href)} className={styles.kpi} data-alert={s.alert ? "true" : undefined}>
              <span className={styles.kpiValue}>{s.value}</span>
              <span className={styles.kpiLabel}>{s.label}</span>
              {s.note && <span className={styles.kpiNote}>{s.note}</span>}
            </Link>
          </li>
        ))}
      </ul>

      <div className={styles.columns}>
        <section className={`${styles.panel} ${styles.attention}`} aria-labelledby="pa-attention">
          <h2 id="pa-attention" className={styles.panelTitle}>Needs attention</h2>
          {attention.length === 0 ? (
            <p className={styles.empty}>All clear — no open reports, new inquiries or unlinked team-seasons.</p>
          ) : (
            <ul className={styles.attentionList}>
              {attention.map(g => (
                <li key={g.id}>
                  <Link href={g.href} className={styles.attentionRow} data-state={g.state}>
                    <span className={styles.attentionHead}>
                      <span className={styles.attentionLabel}>{g.label}</span>
                      <span className={styles.attentionHeadline}>
                        {g.state === "failed" && <span className={styles.warn} aria-hidden="true">!</span>}
                        {g.headline}
                      </span>
                    </span>
                    <span className={styles.chevron} aria-hidden="true">›</span>
                  </Link>
                  {g.lines.length > 0 && (
                    <ul className={styles.attentionItems}>
                      {g.lines.map((l, i) => (
                        <li key={i}>
                          <span className={styles.itemText}>{l.text}</span>
                          <span className={styles.itemMeta}>{l.meta}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <nav className={`${styles.panel} ${styles.quick}`} aria-labelledby="pa-quick">
          <h2 id="pa-quick" className={styles.panelTitle}>Quick actions</h2>
          <ul className={styles.quickGrid}>
            {QUICK_ACTIONS.map(a => (
              <li key={a.href}>
                <Link href={a.href} prefetch={noPrefetch(a.href)} className={styles.quickAction}>
                  <span className={styles.quickIcon} aria-hidden="true">{a.icon}</span>
                  <span>{a.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section className={`${styles.panel} ${styles.activity}`} aria-labelledby="pa-activity">
          <div className={styles.panelHead}>
            <h2 id="pa-activity" className={styles.panelTitle}>Recent activity</h2>
            <Link href="/admin/audit" prefetch={false} className={styles.panelLink}>View all</Link>
          </div>
          {activity.state === "failed" && (
            <p className={styles.failed}><span className={styles.warn} aria-hidden="true">!</span>Couldn&apos;t load recent activity. Try again, or open the audit log.</p>
          )}
          {activity.state === "empty" && <p className={styles.empty}>No recent activity yet.</p>}
          {activity.state === "loaded" && (
            <ol className={styles.activityList}>
              {activity.items.map(a => (
                <li key={a.id} className={styles.activityItem}>
                  <span className={styles.activityIcon} data-kind={a.kind} aria-hidden="true">{a.icon}</span>
                  <span className={styles.activityBody}>
                    <span className={styles.activityText}>{a.text}</span>
                    <span className={styles.activityMeta}>
                      <span className={styles.activityActor}>{a.actor}</span>
                      <span aria-hidden="true"> · </span>
                      <time dateTime={a.at} className={styles.activityTime}>{a.age}</time>
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
