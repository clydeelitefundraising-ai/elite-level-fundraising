import Link from "next/link";
import { getPeopleStats } from "@/lib/platform/peopleStats";
import { ROLES, STATUSES, type PeopleCounts, type Role, type Status } from "@/lib/platform/peopleStatsLogic";
import styles from "./People.module.css";

export const dynamic = "force-dynamic";

// /platform-admin/people — People on ELF. The /platform-admin layout has
// already verified the Platform Admin account. Aggregate numbers only:
// nothing on this page identifies anyone (rules: peopleStatsLogic.ts).

const ROLE_LABEL: Record<Role, string> = {
  athlete: "Athletes",
  head_coach: "Head coaches",
  assistant_coach: "Assistant coaches",
  parent: "Parents",
  booster: "Boosters",
};
const STATUS_LABEL: Record<Status, { label: string; help: string }> = {
  account_linked: { label: "Account linked", help: "At least one of their team records is linked to an ELF account." },
  team_login_only: { label: "Team login only", help: "On a team with a team login, but no ELF account linked." },
  roster_only: { label: "Roster only", help: "Athletes listed on a roster who haven't joined the team app." },
};

const n = (v: number) => v.toLocaleString("en-US");
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

function Breakdown({ caption, rows, allTime, current }: {
  caption: string;
  rows: { key: string; label: string; help?: string; pick: (c: PeopleCounts) => number }[];
  allTime: PeopleCounts;
  current: PeopleCounts;
}) {
  return (
    <table className={styles.table}>
      <caption className={styles.caption}>{caption}</caption>
      <thead>
        <tr><th scope="col">{" "}</th><th scope="col">All-time</th><th scope="col">Current seasons</th></tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key}>
            <th scope="row">
              {r.label}
              {r.help && <span className={styles.help}>{r.help}</span>}
            </th>
            <td>{n(r.pick(allTime))}</td>
            <td>{n(r.pick(current))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function PeoplePage() {
  const stats = await getPeopleStats();

  if (!stats) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/platform-admin" className={styles.back}>← Dashboard</Link>
          <h1 className={styles.title}>People on ELF</h1>
        </header>
        <p role="alert" className={styles.unavailable}>People statistics are unavailable right now. Please try again shortly.</p>
      </div>
    );
  }

  const { allTime, current, teamSeasons, pending, exclusions } = stats;
  const roleRows = [
    ...ROLES.map(role => ({ key: role, label: ROLE_LABEL[role], pick: (c: PeopleCounts) => c.byRole[role] })),
    ...(allTime.otherRole > 0 ? [{ key: "other", label: "Other team roles", pick: (c: PeopleCounts) => c.otherRole }] : []),
  ];
  const statusRows = STATUSES.map(s => ({ key: s, label: STATUS_LABEL[s].label, help: STATUS_LABEL[s].help, pick: (c: PeopleCounts) => c.byStatus[s] }));
  const updated = new Date(stats.computedAt).toLocaleString("en-US", { timeZone: "America/Phoenix", dateStyle: "medium", timeStyle: "short" });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/platform-admin" className={styles.back}>← Dashboard</Link>
        <h1 className={styles.title}>People on ELF</h1>
        <p className={styles.subtitle}>Unique people across ELF team-seasons, with or without an ELF account. Updated {updated} (Arizona time).</p>
      </header>

      <ul className={styles.totals} aria-label="Totals">
        <li className={styles.total}>
          <span className={styles.totalValue}>{n(allTime.total)}</span>
          <span className={styles.totalLabel}>All-time</span>
          <span className={styles.totalNote}>{plural(teamSeasons.included, "team-season", "team-seasons")}, including archived and completed</span>
        </li>
        <li className={styles.total}>
          <span className={styles.totalValue}>{n(current.total)}</span>
          <span className={styles.totalLabel}>Current seasons</span>
          <span className={styles.totalNote}>{plural(teamSeasons.current, "team-season", "team-seasons")} not archived or completed</span>
        </li>
      </ul>

      <section className={styles.panel} aria-labelledby="people-roles">
        <h2 id="people-roles" className={styles.panelTitle}>By role</h2>
        <Breakdown caption="People by role" rows={roleRows} allTime={allTime} current={current} />
        <p className={styles.note}>
          Someone with more than one role is counted under each of them, so roles add up to more than the total.
          People with more than one role: <strong>{n(allTime.multipleRoles)}</strong> all-time, <strong>{n(current.multipleRoles)}</strong> in current seasons.
        </p>
      </section>

      <section className={styles.panel} aria-labelledby="people-status">
        <h2 id="people-status" className={styles.panelTitle}>By account status</h2>
        <Breakdown caption="People by account status" rows={statusRows} allTime={allTime} current={current} />
        <p className={styles.note}>ELF doesn&apos;t record sign-ins, so this shows whether an ELF account is linked — not whether it has been used.</p>
      </section>

      <section className={styles.panel} aria-labelledby="people-pending">
        <h2 id="people-pending" className={styles.panelTitle}>Pending — not included in the totals</h2>
        {stats.pendingAvailable ? (
          <dl className={styles.pending}>
            <div><dt>Staff invitations awaiting acceptance</dt><dd>{n(pending.staffInvitations)}</dd></div>
            <div><dt>Parent access requests</dt><dd>{n(pending.parentRequests)}</dd></div>
            <div><dt>Athlete join requests</dt><dd>{n(pending.athleteRequests)}</dd></div>
            <div><dt>Unused coach account-link invitations <span className={styles.help}>These coaches are already counted above.</span></dt><dd>{n(pending.coachLinkInvitations)}</dd></div>
          </dl>
        ) : (
          <p role="alert" className={styles.unavailable}>Pending invitations and requests couldn&apos;t be loaded right now.</p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="people-method">
        <h2 id="people-method" className={styles.panelTitle}>How people are counted</h2>
        <ul className={styles.method}>
          <li>Each person is counted once: records linked to the same ELF account, an athlete carried into a new season, and coaches with the same email address are combined.</li>
          <li>People are never combined by name. Unregistered people who appear on more than one team may be counted more than once.</li>
          <li>Matching coach emails don&apos;t count as a linked account.</li>
          <li>
            Internal test records are omitted: {plural(teamSeasons.excludedTest, "test team-season", "test team-seasons")}
            {exclusions.environment === "none" ? " (no exclusion list applies to this environment)" : ""}.
            Demo campaigns are omitted too: {plural(teamSeasons.demo, "demo team-season", "demo team-seasons")}.
          </li>
          {stats.orphanRecords > 0 && <li>{plural(stats.orphanRecords, "team record belongs", "team records belong")} to a team-season that no longer exists and {stats.orphanRecords === 1 ? "isn't" : "aren't"} counted.</li>}
        </ul>
      </section>
    </div>
  );
}
