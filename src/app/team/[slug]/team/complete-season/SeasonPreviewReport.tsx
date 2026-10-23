// Complete Season Phase 3 — the preview, as the Head Coach / platform admin
// reads it. Presentational only: it shows what completing the season WOULD
// do. It has no button that completes anything (execution isn't built).
import type { OpenCheckouts, SeasonPreview } from "@/lib/seasonPreview";
import styles from "./SeasonPreview.module.css";
import { blockerText, warningText, FLAG_REASON_TEXT, ROLE_TEXT, formatCents, plural } from "./seasonPreviewText";

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

export default function SeasonPreviewReport({ preview, openCheckouts, completionEnabled = false }: {
  preview: SeasonPreview;
  openCheckouts: OpenCheckouts;
  /** Phase 5A: completion is switched on (the confirm step follows below). */
  completionEnabled?: boolean;
}) {
  const p = preview;
  const blocked = p.blockers.length > 0;
  const mustRejoin = [...p.members.must_rejoin.map(m => ({ key: m.member_id, name: m.name, role: m.role })),
                      ...p.coaches.must_rejoin.map(c => ({ key: c.coach_id, name: c.name, role: c.role }))];
  const pendingTotal = p.open_items.pending_athlete_requests + p.open_items.pending_parent_requests + p.open_items.pending_staff_invitations;

  return (
    <div className={styles.report}>
      {/* 1–2: current and next season */}
      <Section id="season-next" title="Current and next season">
        <div className={styles.seasonPair}>
          <div className={styles.seasonCard}>
            <span className={styles.kicker}>Current season</span>
            <strong className={styles.seasonName}>{p.from.season_label || "—"}</strong>
            <span className={styles.slug}>/{p.from.slug}</span>
          </div>
          <span className={styles.arrow} aria-hidden="true">→</span>
          <div className={`${styles.seasonCard} ${styles.seasonCardNext}`}>
            <span className={styles.kicker}>Next season</span>
            <strong className={styles.seasonName}>{p.proposed.season_label ?? "Choose a name"}</strong>
            <span className={styles.slug}>{p.proposed.slug ? `/${p.proposed.slug}` : "Choose an address"}</span>
            {(p.proposed.slug_source === "provided" || p.proposed.label_source === "provided") && (
              <span className={styles.note}>Using the name or address you entered.</span>
            )}
          </div>
        </div>
        <p className={styles.para}>
          The current season becomes a read-only archive and the next season becomes this team&apos;s active season immediately.
        </p>
      </Section>

      {/* 12: blockers */}
      {blocked && (
        <Section id="season-blockers" title="Resolve before completing">
          <ul className={styles.alertList} data-tone="blocker">
            {p.blockers.map(b => <li key={b}>{blockerText(b)}</li>)}
          </ul>
          {pendingTotal > 0 && (
            <p className={styles.para}>
              Waiting: {plural(p.open_items.pending_athlete_requests, "athlete request")},{" "}
              {plural(p.open_items.pending_parent_requests, "parent request")},{" "}
              {plural(p.open_items.pending_staff_invitations, "staff invitation")}.
            </p>
          )}
        </Section>
      )}

      {/* 3–8: roster */}
      <Section id="season-roster" title="Athletes">
        <div className={styles.stats}>
          <Stat value={p.roster.graduating} label="Seniors graduate" />
          <Stat value={p.roster.freshman_to_sophomore} label="Freshmen → Sophomores" />
          <Stat value={p.roster.sophomore_to_junior} label="Sophomores → Juniors" />
          <Stat value={p.roster.junior_to_senior} label="Juniors → Seniors" />
          <Stat value={p.roster.unchanged_middle_school} label="Middle school (unchanged)" />
          <Stat value={p.roster.returning} label="Athletes returning" />
        </div>
        <p className={styles.para}>
          Graduating seniors leave the active roster. Their records, attendance and fundraising stay with this season.
        </p>
        {p.roster.flagged.length > 0 && (
          <div className={styles.callout} data-tone="warning">
            <strong>{plural(p.roster.flagged.length, "athlete")} need a grade review</strong>
            <span>They&apos;ll carry over with the grade shown, unchanged.</span>
            <ul className={styles.nameList}>
              {p.roster.flagged.map(a => (
                <li key={a.athlete_id}>
                  <span className={styles.name}>{a.name}</span>
                  <span className={styles.tag}>{a.class_year?.trim() ? a.class_year : FLAG_REASON_TEXT[a.reason] ?? a.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* 9–10: families and staff */}
      <Section id="season-people" title="Families and staff carrying over">
        <div className={styles.stats}>
          <Stat value={p.members.athletes_carried} label="Athlete accounts" />
          <Stat value={p.members.parents_carried} label="Parents" />
          <Stat value={p.members.parent_links_carried} label="Parent–athlete links" />
          <Stat value={p.members.boosters_carried + p.coaches.booster_carried} label="Boosters" />
          <Stat value={p.coaches.head_carried} label="Head Coaches" />
          <Stat value={p.coaches.assistant_carried} label="Assistant Coaches" />
        </div>
        <p className={styles.para}>
          Parents carry over for their returning athletes. Parents whose only athletes graduate keep access to this season&apos;s history.
        </p>
      </Section>

      {/* 11: must rejoin */}
      {mustRejoin.length > 0 && (
        <Section id="season-rejoin" title="Must rejoin the new season">
          <p className={styles.para}>
            These people don&apos;t have ELF accounts, so they can&apos;t be carried over. Share the new season&apos;s join code with them, or invite them.
          </p>
          <ul className={styles.nameList}>
            {mustRejoin.map(m => (
              <li key={m.key}>
                <span className={styles.name}>{m.name}</span>
                <span className={styles.tag}>{ROLE_TEXT[m.role] ?? m.role}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 13: history */}
      <Section id="season-history" title="Kept in this season's history (read-only)">
        <ul className={styles.factList}>
          <li>{plural(p.left_in_history.message_threads, "conversation")} — direct and group messages stay readable, but no new messages.</li>
          <li>{plural(p.left_in_history.attendance_sessions, "attendance day")} of attendance.</li>
          <li>{plural(p.left_in_history.announcements, "announcement")}.</li>
          <li>{plural(p.left_in_history.donations, "donation")} and this season&apos;s fundraising totals.</li>
          <li>{plural(p.left_in_history.todo_tasks, "To-Do task")} — the new season starts with a fresh To-Do List.</li>
          <li>{plural(p.left_in_history.clearance_resources, "resource")} in the To-Do List.</li>
        </ul>
      </Section>

      {/* 14–15: fundraising and partners */}
      <Section id="season-fundraising" title="Fundraising, sponsors and partners">
        <ul className={styles.factList}>
          <li>The new season&apos;s fundraising totals and leaderboards start at <strong>$0</strong>.</li>
          <li>The new fundraiser starts <strong>inactive</strong> — ELF turns it on when you&apos;re ready.</li>
          <li>Team goal {formatCents(p.copied.team_goal_cents)} and default athlete goal {formatCents(p.copied.default_athlete_goal_cents)} carry over; the deadline is cleared.</li>
          <li>{plural(p.copied.fund_uses, "fund use")} and {plural(p.copied.store_products, "Team Shop product")} carry over.</li>
          <li>{plural(p.left_in_history.team_sponsors, "Team Sponsor")} stay with this season and aren&apos;t renewed automatically.</li>
          <li>ELF Community Partners are unchanged{p.from.has_organization ? " — your school's partner settings carry on" : ""}.</li>
        </ul>
      </Section>

      {/* 16–17: calendar and join code */}
      <Section id="season-calendar" title="Calendar and joining">
        <ul className={styles.factList}>
          <li>{plural(p.calendar.future_events_to_copy, "calendar event")} from {p.calendar.cutoff_local_date} onward are copied to the new season. Past events stay here.</li>
          {p.calendar.subscription_moves && <li>Your calendar subscription link moves to the new season — subscribers don&apos;t need a new link.</li>}
          <li>A <strong>new join code</strong> is created for the new season. This season&apos;s code stops working.</li>
        </ul>
      </Section>

      {/* 18 + other warnings */}
      {(p.warnings.length > 0 || openCheckouts.state === "unknown" || (openCheckouts.state === "checked" && openCheckouts.count > 0)) && (
        <Section id="season-warnings" title="Before you continue">
          <ul className={styles.alertList} data-tone="warning">
            {p.warnings.map(w => (
              <li key={w}>
                {warningText(w)}
                {w === "season_recent_donations" && ` (${plural(p.open_items.donations_last_24h, "donation")})`}
              </li>
            ))}
            {openCheckouts.state === "checked" && openCheckouts.count > 0 && (
              <li>
                {openCheckouts.more ? "At least " : ""}{plural(openCheckouts.count, "donation checkout")} started in the last 24 hours
                {openCheckouts.count === 1 ? " is" : " are"} still open. If completed, they&apos;ll count toward this season.
              </li>
            )}
            {openCheckouts.state === "unknown" && (
              <li>Open donation checkouts couldn&apos;t be checked right now. Any that finish will count toward this season.</li>
            )}
          </ul>
        </Section>
      )}

      <div className={styles.footerNote} role="note">
        {completionEnabled
          ? <><strong>Before you confirm:</strong> completing takes effect immediately and can&apos;t be undone from the app.</>
          : <><strong>Preview only.</strong> Completing a season isn&apos;t available yet. When it is, it will take effect immediately and can&apos;t be undone from the app.</>}
      </div>
    </div>
  );
}
