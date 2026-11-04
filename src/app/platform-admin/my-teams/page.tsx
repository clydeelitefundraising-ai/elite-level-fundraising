import { requirePlatformAdminPage } from "@/lib/platformAdminPageGuard";
import Link from "next/link";
import { getAccountSession, getAccountTeams } from "@/lib/accountSession";
import styles from "../_components/SectionHub.module.css";

export const dynamic = "force-dynamic";

// /platform-admin/my-teams — teams the admin belongs to personally (as a
// coach, parent, athlete or booster). Platform Admins land on the admin
// dashboard instead of Choose Your Team, so this is their way back to their
// own teams. Read-only list; the /platform-admin layout has already
// verified the Platform Admin account.

const ROLE_LABEL: Record<string, string> = {
  head_coach: "Head Coach", assistant_coach: "Assistant Coach", booster: "Booster", athlete: "Athlete", parent: "Parent",
};

export default async function MyTeamsPage() {
  await requirePlatformAdminPage();
  const session = await getAccountSession();
  let teams: Awaited<ReturnType<typeof getAccountTeams>> | null = null;
  try {
    teams = session ? await getAccountTeams(session.id) : [];
  } catch {
    teams = null;
  }

  return (
    <div>
      <h1 className={styles.title}>My Teams</h1>
      <p className={styles.summary}>
        Teams you belong to yourself. In a team you still act as a Platform Admin (shown by the admin banner), with Head Coach access.
      </p>
      {teams === null ? (
        <p className={styles.panel} role="alert">Your teams couldn&apos;t be loaded. Reload to try again.</p>
      ) : teams.length === 0 ? (
        <p className={styles.panel}>You don&apos;t belong to any team with this account.</p>
      ) : (
        <ul className={styles.grid}>
          {teams.map(t => (
            <li key={t.campaign_slug}>
              <Link href={`/team/${encodeURIComponent(t.campaign_slug)}/home`} className={styles.card}>
                <span className={styles.cardTitle}>
                  {[t.school_name, t.sport_name].filter(Boolean).join(" ") || t.campaign_slug}
                  {t.season_completed && <span className={styles.legacy}>Completed</span>}
                </span>
                <span className={styles.cardText}>
                  {[ROLE_LABEL[t.role] ?? t.role, t.season].filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.note}>
        <Link href="/teams?view=my-teams">Open the full team chooser</Link> to join another team or check pending requests.
      </p>
    </div>
  );
}
