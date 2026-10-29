// One Campaign Overview card for every Fundraiser role — replaces the
// coach's separate "Campaign Progress" + "Analytics" team cards (same
// numbers shown twice, with two different goals) and the booster/public
// Campaign Progress card, and gives athletes/parents a compact team view.
//
// Decision 1 (goal semantics): the headline goal and its progress bar are
// the DISPLAYED goal (getDisplayGoalCents, unchanged — what donors and
// athletes see). For coaches, the STORED base goal appears as a labeled
// secondary line, and "Needed for Base Goal" is computed from it, so a
// $12,000 headline never sits next to an unexplained base-goal remainder.
// Days remaining / season completed behave exactly as before.
import { isSeasonCompleted } from "@/lib/seasonState";
import type { CampaignSettings } from "@/lib/supabase";
import { summarizeCampaignGoal } from "./fundraiserData";
import { fmt } from "./fundraiserFormat";
import styles from "./Fundraiser.module.css";

function daysLeft(deadline: string): number {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000));
}

type Stat = { label: string; value: string; urgent?: boolean; testId?: string };

export default function CampaignOverviewCard({
  settings, raisedCents, donationCount, displayGoalCents, variant,
}: {
  settings:         CampaignSettings;
  raisedCents:      number;
  donationCount:    number;
  displayGoalCents: number;
  /** coach: full overview incl. base goal; team: booster/public view;
   *  compact: athlete/parent team summary (raised, goal, progress). */
  variant:          "coach" | "team" | "compact";
}) {
  const baseGoalCents = settings.goal_cents ?? 0;
  const goal = summarizeCampaignGoal(baseGoalCents, displayGoalCents, raisedCents);
  const pct = goal.displayPct;
  // Complete Season Phase 4: a completed season has no countdown — its
  // totals and donations stay, the deadline no longer applies.
  const seasonCompleted = isSeasonCompleted(settings);
  const remaining  = settings.deadline && !seasonCompleted ? daysLeft(settings.deadline) : null;
  const avgDonation = donationCount > 0 ? Math.round(raisedCents / donationCount) : null;
  const subtitle = [settings.mascot, settings.sport_name].filter(Boolean).join(" · ");

  const stats: Stat[] = [];
  if (variant === "coach") {
    stats.push({ label: "Donations", value: String(donationCount) });
    stats.push({ label: "Avg Donation", value: fmt(avgDonation ?? 0) });
    if (remaining !== null) stats.push({ label: "Days Remaining", value: String(remaining), urgent: remaining <= 7 });
    if (baseGoalCents > 0) {
      stats.push({
        label: goal.goalStepped ? "Needed for Base Goal" : "Still Needed",
        value: fmt(goal.neededForBaseCents),
        testId: "needed-stat",
      });
    }
  } else if (variant === "team") {
    stats.push({ label: "Donations", value: String(donationCount) });
    if (avgDonation !== null) stats.push({ label: "Avg Donation", value: fmt(avgDonation) });
    if (displayGoalCents > 0 && avgDonation === null) {
      stats.push({ label: "Still Needed", value: fmt(Math.max(0, displayGoalCents - raisedCents)) });
    }
    if (remaining !== null) stats.push({ label: "Days Remaining", value: String(remaining), urgent: remaining <= 7 });
  }

  return (
    <section className={styles.card} data-testid={`campaign-overview-${variant}`} aria-label="Campaign overview">
      {variant === "compact" ? (
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Team Campaign</h3>
        </div>
      ) : (
        <div className={styles.overviewBand}>
          {settings.season && <div className={styles.overviewSeason}>{settings.season}</div>}
          <div className={styles.overviewSchool}>{settings.school_name}</div>
          {subtitle && <div className={styles.overviewSub}>{subtitle}</div>}
        </div>
      )}

      <div className={styles.overviewBody}>
        {variant === "compact" && <div className={styles.rowMeta} style={{ marginBottom: ".2rem" }}>{settings.school_name}</div>}
        <div>
          <span className={styles.raised} style={variant === "compact" ? { fontSize: "1.4rem" } : undefined}>{fmt(raisedCents)}</span>
          {displayGoalCents > 0 && <span className={styles.raisedGoal}>of {fmt(displayGoalCents)} goal</span>}
        </div>

        {displayGoalCents > 0 && (
          <>
            <div
              className={styles.bar}
              role="progressbar"
              aria-label="Team fundraising progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div className={styles.barFill} style={{ width: `${pct}%` }} />
            </div>
            <div className={styles.funded}>{pct}% funded</div>
          </>
        )}

        {variant === "coach" && goal.goalStepped && (
          <p className={styles.baseGoalNote} data-testid="base-goal-note">
            <strong>Base goal {fmt(baseGoalCents)}</strong> · {goal.basePct}% reached. The displayed goal steps up as the
            team gets close; Needed for Base Goal, pace and projections use the base goal.
          </p>
        )}

        {variant !== "compact" && (stats.length > 0 || seasonCompleted) && (
          <div className={styles.statsGrid}>
            {stats.map(s => (
              <div key={s.label} className={styles.stat} data-testid={s.testId}>
                <div className={`${styles.statValue}${s.urgent ? ` ${styles.statUrgent}` : ""}`}>{s.value}</div>
                <div className={styles.statLabel}>{s.label}</div>
              </div>
            ))}
            {seasonCompleted && (
              <div data-testid="season-completed-stat" className={styles.stat}>
                <div className={styles.statValue}>Season completed</div>
                <div className={styles.statLabel}>archived totals</div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
