import Link from "next/link";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { getAdminDashboardCounts } from "@/lib/platform/adminDashboard";
import { ADMIN_NAV, navSection } from "@/lib/platformAdminNav";
import { ToolGrid } from "./_components/SectionHub";
import styles from "./_components/SectionHub.module.css";

export const dynamic = "force-dynamic";

// /platform-admin — the Platform Admin dashboard and post-login landing
// page. The layout has already verified the Platform Admin account.
export default async function PlatformAdminDashboardPage() {
  const [admin, counts] = await Promise.all([getPlatformAdminSession(), getAdminDashboardCounts()]);
  const show = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US"));
  const stats = [
    { label: "Open moderation reports", value: show(counts.openReports), href: "/platform-admin/moderation" },
    { label: "New fundraising inquiries", value: show(counts.newInquiries), href: "/platform-admin/fundraising-inquiries" },
    { label: "School records", value: show(counts.schools), href: "/platform-admin/schools" },
    { label: "Team-seasons", value: show(counts.teamSeasons), href: "/admin/campaigns" },
  ];
  const firstName = admin?.name?.trim().split(/\s+/)[0];

  return (
    <div>
      <h1 className={styles.title}>{firstName ? `Welcome, ${firstName}` : "Dashboard"}</h1>
      <p className={styles.summary}>Everything you manage across ELF, in one place.</p>

      <ul className={styles.stats} aria-label="At a glance">
        {stats.map(s => (
          <li key={s.label}>
            <Link href={s.href} className={styles.stat} prefetch={s.href.startsWith("/admin") ? false : undefined}>
              <span className={styles.statValue}>{s.value}</span>
              <span className={styles.statLabel}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className={styles.sectionTitle}>Operations</h2>
      <ToolGrid items={navSection("dashboard").items} />

      <h2 className={styles.sectionTitle}>Areas</h2>
      <ToolGrid
        items={ADMIN_NAV.filter(s => s.id !== "dashboard").map(s => ({ label: s.label, href: s.href, description: s.summary }))}
      />
    </div>
  );
}
