"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AnnouncementRow, CalendarEventRow } from "@/lib/teamData";
import type { TeamActor } from "@/lib/permissions";
import type { PendingRequestSummary } from "@/lib/platform/requests";
import EventDetailsModal from "../_components/EventDetailsModal";
import {
  fmtMoney,
  relativeTime,
  CATEGORY_STYLE,
  UpcomingEventRow,
} from "./HomeView";
import {
  buildQuickActions,
  resolveRequestsCardData,
  shouldShowFundraisingCard,
} from "./coachDashboardHelpers";
import QuickActions from "./QuickActions";
import styles from "./Home.module.css";

function actorFirstName(actor: TeamActor): string {
  if (actor.kind === "public") return "there";
  return actor.session.name.split(" ")[0] || "there";
}

/** Amount raised / display goal / progress / donor count — the same
 *  fields (and the same "hide entirely until something's been raised"
 *  rule) as the existing mobile FundraiserSnapshot. No new query, no
 *  leaderboard/outreach/top-athlete data — those are explicitly deferred
 *  to a later fundraising-focused desktop phase.
 *
 *  Phase 4: color now comes from var(--team-primary) (the Phase 2/3
 *  theming pipeline, which respects branding_customized) instead of the
 *  raw primaryColor prop — the prop was reading settings.primary_color
 *  directly, which bypasses the branding_customized guard entirely and
 *  would show a team's stored placeholder color even when the team has
 *  never customized branding. This is the highest-emphasis panel on the
 *  page, per the design brief. */
function FundraisingCard({
  slug,
  raisedCents,
  goalCents,
  donorCount,
}: {
  slug: string;
  raisedCents: number;
  goalCents: number;
  donorCount: number;
}) {
  const pct = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;
  return (
    <Link
      href={`/team/${slug}/fundraiser`}
      className="elf-surface-card elf-focus-ring"
      style={{ display: "block", textDecoration: "none" }}
    >
      <div className={styles.sectionKicker}>Fundraising</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>
        <div style={{ fontWeight: 800, fontSize: "var(--text-3xl)", color: "var(--text-primary-app)", lineHeight: 1 }}>
          {fmtMoney(raisedCents)}
        </div>
        {goalCents > 0 && (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted-app)" }}>of {fmtMoney(goalCents)}</div>
        )}
      </div>
      {goalCents > 0 && (
        <div style={{ background: "var(--border-app)", borderRadius: "var(--radius-full)", height: 8, overflow: "hidden", margin: "var(--space-3) 0 var(--space-2)" }}>
          <div style={{ background: "var(--team-primary)", height: "100%", width: `${pct}%`, borderRadius: "var(--radius-full)", transition: "width .5s ease" }} />
        </div>
      )}
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted-app)" }}>
        {goalCents > 0 && `${pct}% of goal · `}{donorCount} donor{donorCount !== 1 ? "s" : ""}
      </div>
    </Link>
  );
}

/** Head-Coach/Platform-Admin only (see resolveRequestsCardData — the
 *  entry is simply absent for an Assistant Coach, not
 *  disabled/placeholder). No approve/decline controls — clicking goes to
 *  the existing Requests Center. Count/link only, per the explicit
 *  product requirement that Home never render inline moderation. */
function RequestsEntry({ slug, summary }: { slug: string; summary: PendingRequestSummary }) {
  const hasPending = summary.total > 0;
  return (
    <Link
      href={`/team/${slug}/requests`}
      className="elf-list-row elf-focus-ring"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text-primary-app)" }}>Approvals</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted-app)", marginTop: 2 }}>
          {hasPending
            ? `${summary.athleteRequests} athlete · ${summary.commentApprovals} comment`
            : "All clear"}
        </div>
      </div>
      {hasPending && (
        <span className="elf-badge" style={{ background: "var(--color-error)", color: "#fff" }}>
          {summary.total}
        </span>
      )}
    </Link>
  );
}

/** Unread MESSAGE count only — deliberately separate from the
 *  announcements/Communications signal below (see coachDashboard's
 *  design notes): the two are structurally unrelated data with different
 *  correct destinations, and combining them into one ambiguous number
 *  would be less actionable, not more. Reuses the exact existing
 *  /messages/unread endpoint TeamChrome (D1) already calls and the exact
 *  existing elf:messages-changed event ThreadView already dispatches —
 *  no new endpoint, no new polling, no change to read/polling
 *  architecture. A fresh, independent fetch here (rather than sharing
 *  TeamChrome's in-memory state) avoids coupling the layout's chrome
 *  component to a page-level dashboard component in a different part of
 *  the tree. */
function MessagesEntry({ slug }: { slug: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const load = () => {
      fetch(`/api/team/${slug}/messages/unread`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d?.count !== undefined) setCount(d.count); })
        .catch(() => {});
    };
    load();
    window.addEventListener("elf:messages-changed", load);
    return () => window.removeEventListener("elf:messages-changed", load);
  }, [slug]);

  const display = count ?? 0;
  return (
    <Link
      href={`/team/${slug}/messages`}
      className="elf-list-row elf-focus-ring"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text-primary-app)" }}>Messages</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted-app)", marginTop: 2 }}>
          {display === 0 ? "All read" : `${display} unread`}
        </div>
      </div>
      {display > 0 && (
        <span className="elf-badge" style={{ background: "var(--color-error)", color: "#fff" }}>
          {display}
        </span>
      )}
    </Link>
  );
}

/** Compact, non-interactive announcement summary — deliberately NOT the
 *  full AnnouncementCard: that component carries its own
 *  useSeenTracker/edit/delete wiring, which this preview should not
 *  duplicate (see the D2 design plan on why mounting a second seen-
 *  tracking instance for the same announcement is unnecessary here).
 *  Rendered as a flat list row, not its own floating card, per the
 *  "reserve cards for content that genuinely needs grouping" rule. */
function CompactAnnouncementRow({ a }: { a: AnnouncementRow }) {
  const cat = CATEGORY_STYLE[a.category] ?? CATEGORY_STYLE["team"];
  return (
    <div className="elf-list-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: 4 }}>
          <span style={{
            background: cat.bg, color: cat.color, borderRadius: "var(--radius-full)",
            fontSize: "10px", fontWeight: 700, padding: "1px 8px", textTransform: "uppercase", letterSpacing: ".03em",
          }}>
            {a.category.replace("-", " ")}
          </span>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted-app)" }}>{relativeTime(a.created_at)}</span>
        </div>
        <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text-primary-app)", marginBottom: 2 }}>{a.title}</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted-app)" }}>{a.author_name}</div>
      </div>
    </div>
  );
}

export type CoachDashboardProps = {
  slug: string;
  actor: TeamActor;
  initialAnnouncements: AnnouncementRow[];
  initialUpcoming: CalendarEventRow[];
  raisedCents?: number;
  goalCents?: number;
  primaryColor?: string;
  donorCount?: number;
  pendingRequestSummary?: PendingRequestSummary;
  schoolName?: string;
  sportName?: string;
  season?: string;
};

export default function CoachDashboard({
  slug,
  actor,
  initialAnnouncements,
  initialUpcoming,
  raisedCents = 0,
  goalCents = 0,
  donorCount = 0,
  pendingRequestSummary,
  schoolName,
  sportName,
  season,
}: CoachDashboardProps) {
  const [viewingEvent, setViewingEvent] = useState<CalendarEventRow | null>(null);

  const quickActions = buildQuickActions(slug, actor);
  const requestsData = pendingRequestSummary ? resolveRequestsCardData(actor, pendingRequestSummary) : null;
  const showFundraising = shouldShowFundraisingCard(raisedCents);
  const upcoming = initialUpcoming.slice(0, 5);
  const recentAnnouncements = initialAnnouncements.slice(0, 5);

  const teamContext = [schoolName, sportName].filter(Boolean).join(" · ") + (season ? ` · ${season}` : "");

  return (
    <div className={styles.dashboardShell} style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* 1 — Team status / identity (compact, no oversized hero) */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em" }}>
          Welcome back, {actorFirstName(actor)}
        </h1>
        {teamContext && (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary-app)", marginTop: 4 }}>{teamContext}</div>
        )}
      </div>

      <div className={styles.mainGrid}>
        {/* LEFT / MAIN — fundraising, recent activity, latest announcement */}
        <div className={styles.mainColumn}>
          {showFundraising && (
            <FundraisingCard slug={slug} raisedCents={raisedCents} goalCents={goalCents} donorCount={donorCount} />
          )}

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
              <h2 className={styles.sectionHeading}>Recent Team Activity</h2>
              <Link href={`/team/${slug}/communications?tab=updates`} className={`${styles.sectionLink} elf-focus-ring`}>
                View Communications →
              </Link>
            </div>
            {recentAnnouncements.length === 0 ? (
              <div className="elf-empty-state">No announcements yet.</div>
            ) : (
              <div className="elf-section-flat" style={{ padding: 0 }}>
                {recentAnnouncements.map(a => <CompactAnnouncementRow key={a.id} a={a} />)}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT / SECONDARY — next event, quick actions, approvals */}
        <div className={styles.sideColumn}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
              <h2 className={styles.sectionHeading} style={{ fontSize: "var(--text-base)" }}>Upcoming</h2>
              <Link href={`/team/${slug}/calendar`} className={`${styles.sectionLink} elf-focus-ring`}>
                View Calendar →
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <div className="elf-empty-state">Nothing scheduled yet.</div>
            ) : (
              <div className="elf-section-flat" style={{ padding: 0 }}>
                {upcoming.slice(0, 3).map(ev => <UpcomingEventRow key={ev.id} ev={ev} onOpen={setViewingEvent} />)}
              </div>
            )}
          </div>

          <div>
            <h2 className={styles.sectionHeading} style={{ fontSize: "var(--text-base)", marginBottom: "var(--space-2)" }}>Quick Actions</h2>
            <QuickActions actions={quickActions} />
          </div>

          <div className="elf-section-flat" style={{ padding: 0 }}>
            {requestsData && <RequestsEntry slug={slug} summary={requestsData} />}
            <MessagesEntry slug={slug} />
          </div>
        </div>
      </div>

      {viewingEvent && (
        <EventDetailsModal ev={viewingEvent} canManage={false} onClose={() => setViewingEvent(null)} />
      )}
    </div>
  );
}
