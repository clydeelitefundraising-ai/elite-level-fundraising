// Shared building blocks for the compact Fundraiser dashboard and its
// full-list views. Presentation only, with no hooks, so the server page and
// the client FundraiserView render the same rows. Callers decide what
// records a role may see; these components never fetch or widen anything.
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronDown, HandCoins, Trophy, Users } from "lucide-react";
import { fmt, initials, avatarColor, timeAgo, donationsLabel } from "./fundraiserFormat";
import styles from "./Fundraiser.module.css";

export function SectionCard({
  title, count, aside, footer, children, testId,
}: {
  title:    string;
  count?:   number;
  aside?:   ReactNode;
  footer?:  ReactNode;
  children: ReactNode;
  testId?:  string;
}) {
  return (
    <section className={styles.card} data-testid={testId}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{title}</h3>
        {count !== undefined && count > 0 && <span className={styles.countBadge}>{count}</span>}
        {aside && <span className={styles.headerAside}>{aside}</span>}
      </div>
      {children}
      {footer}
    </section>
  );
}

/** Expand/collapse inside the dashboard (Pace, Export). Native
 *  <details>, so it is collapsed by default, keyboard operable, and
 *  announced as expandable by screen readers without extra state. */
export function CollapsibleSection({
  title, badge, children, testId,
}: {
  title:    string;
  badge?:   ReactNode;
  children: ReactNode;
  testId?:  string;
}) {
  return (
    <details className={styles.collapsible} data-testid={testId}>
      <summary className={styles.summary}>
        <span className={styles.cardTitle}>{title}</span>
        {badge}
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={styles.chevron} />
      </summary>
      <div className={styles.collapsibleBody}>{children}</div>
    </details>
  );
}

/** "View All …" link under a top-five list. Only rendered when there is
 *  actually more to see. */
export function ViewAllLink({ href, label, total, shown }: { href: string; label: string; total: number; shown: number }) {
  if (total <= shown) return null;
  return (
    <Link href={href} className={styles.viewAll} aria-label={`${label} (${total})`}>
      {label} ({total}) <ArrowRight size={14} strokeWidth={2.25} aria-hidden="true" />
    </Link>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className={styles.empty}>
      {icon}
      <div>
        <div className={styles.emptyTitle}>{title}</div>
        <div className={styles.emptyText}>{text}</div>
      </div>
    </div>
  );
}

const iconStyle = { color: "var(--text-muted-app)", flexShrink: 0 } as const;

export type AthleteRowData = {
  id:              string;
  name:            string;
  profile_photo:   string | null;
  class_year:      string | null;
  event:           string | null;
  raisedCents:     number;
  donorCount:      number;
  rank:            number;
  lastDonationAt?: string | null;
};

/** Ranked athlete rows — the leaderboard (athletes/parents/boosters) and
 *  the coach's Athlete Progress list. Entries arrive already ranked by the
 *  existing builders; this never re-sorts. No per-row goal percentage
 *  (see leaderboardProgressBar.test.ts). */
export function AthleteRows({
  entries, currentAthleteId, detail = "leaderboard",
}: {
  entries:           AthleteRowData[];
  currentAthleteId?: string;
  detail?:           "leaderboard" | "progress";
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Trophy size={16} strokeWidth={2} style={iconStyle} />}
        title="No leaderboard yet"
        text="Athlete totals will appear here after donations are attributed."
      />
    );
  }
  return (
    <ol className={styles.list}>
      {entries.map(entry => {
        const isCurrent = entry.id === currentAthleteId;
        const sub = entry.class_year ?? entry.event;
        const meta = [
          sub,
          entry.donorCount > 0 ? donationsLabel(entry.donorCount) : (detail === "progress" ? "No donations" : null),
          detail === "progress" && entry.lastDonationAt ? `Last: ${timeAgo(entry.lastDonationAt)}` : null,
        ].filter(Boolean).join(" · ");
        return (
          <li key={entry.id} className={`${styles.row}${isCurrent ? ` ${styles.rowCurrent}` : ""}`} aria-current={isCurrent ? "true" : undefined}>
            <span className={`${styles.rank}${entry.rank <= 3 ? ` ${styles.rankTop}` : ""}`} aria-label={`Rank ${entry.rank}`}>#{entry.rank}</span>
            {entry.profile_photo ? (
              <img src={entry.profile_photo} alt="" className={styles.avatar} />
            ) : (
              <span className={styles.avatar} style={{ background: avatarColor(entry.name) }} aria-hidden="true">{initials(entry.name)}</span>
            )}
            <div className={styles.rowMain}>
              <div className={styles.rowTop}>
                <span className={styles.rowName}>{entry.name}{isCurrent ? " (you)" : ""}</span>
                <span className={styles.rowAmount}>{fmt(entry.raisedCents)}</span>
              </div>
              {meta && <div className={styles.rowMeta}>{meta}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export type DonationRowData = {
  donor_name:       string | null;
  amount_cents:     number;
  athlete_label?:   string | null;
  donation_message: string | null;
  created_at:       string;
};

/** Donation rows. Anonymity is unchanged: a donation with no donor name
 *  shows as "Anonymous"; messages render as stored. */
export function DonationRows({ donations, emptyText }: { donations: DonationRowData[]; emptyText?: string }) {
  if (donations.length === 0) {
    return (
      <EmptyState
        icon={<HandCoins size={16} strokeWidth={2} style={iconStyle} />}
        title="No fundraising activity yet"
        text={emptyText ?? "Donations will appear here once your fundraiser gets moving."}
      />
    );
  }
  return (
    <ul className={styles.list}>
      {donations.map((d, i) => (
        <li key={i} className={styles.row}>
          <span className={styles.avatar} style={{ background: "var(--team-secondary)" }} aria-hidden="true">
            {d.donor_name ? initials(d.donor_name) : "?"}
          </span>
          <div className={styles.rowMain}>
            <div className={styles.rowTop}>
              <span className={styles.rowName}>
                {d.donor_name ?? "Anonymous"}
                {d.athlete_label && <span className={styles.rowMeta} style={{ display: "inline" }}> → {d.athlete_label}</span>}
              </span>
              <span className={`${styles.rowAmount} ${styles.rowAmountPositive}`}>{fmt(d.amount_cents)}</span>
            </div>
            <div className={styles.rowMeta}>{timeAgo(d.created_at)}</div>
            {d.donation_message && <div className={styles.rowMessage}>&ldquo;{d.donation_message}&rdquo;</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export type DonorRowData = {
  name:          string;
  totalCents:    number;
  donationCount: number;
  athletes:      string[];
};

/** Coach-only Top Donors rows, highest total first (order from buildTopDonors). */
export function DonorRows({ donors }: { donors: DonorRowData[] }) {
  if (donors.length === 0) {
    return (
      <EmptyState
        icon={<Users size={16} strokeWidth={2} style={iconStyle} />}
        title="No donors yet"
        text="Donors will appear here once donations come in."
      />
    );
  }
  return (
    <ol className={styles.list}>
      {donors.map((d, i) => (
        <li key={`${d.name}-${i}`} className={styles.row}>
          <span className={`${styles.rank}${i < 3 ? ` ${styles.rankTop}` : ""}`} aria-label={`Rank ${i + 1}`}>#{i + 1}</span>
          <div className={styles.rowMain}>
            <div className={styles.rowTop}>
              <span className={styles.rowName}>{d.name}</span>
              <span className={`${styles.rowAmount} ${styles.rowAmountPositive}`}>{fmt(d.totalCents)}</span>
            </div>
            <div className={styles.rowMeta}>
              {donationsLabel(d.donationCount)}
              {d.athletes.length > 0 && ` · → ${d.athletes.slice(0, 2).join(", ")}${d.athletes.length > 2 ? ` +${d.athletes.length - 2}` : ""}`}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Dedicated full-list page: clear Back link to the dashboard, the team
 *  and season it belongs to, then the list. */
export function FullListView({
  backHref, eyebrow, title, note, children, testId,
}: {
  backHref: string;
  eyebrow:  string;
  title:    string;
  note?:    string;
  children: ReactNode;
  testId?:  string;
}) {
  return (
    <div className={styles.fullListWrap} data-testid={testId}>
      <Link href={backHref} className={styles.backLink}>
        <ArrowLeft size={16} strokeWidth={2.25} aria-hidden="true" /> Back to Fundraiser
      </Link>
      <div style={{ margin: ".35rem 0 .6rem" }}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h2 className={styles.pageTitle}>{title}</h2>
        {note && <p className={styles.listNote}>{note}</p>}
      </div>
      <div className={styles.card}>{children}</div>
    </div>
  );
}
