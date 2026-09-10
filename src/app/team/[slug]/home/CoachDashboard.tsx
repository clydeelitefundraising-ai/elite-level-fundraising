"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarPlus as CalendarPlusIcon } from "lucide-react";
import type { AnnouncementRow, CalendarEventRow, SponsorRow } from "@/lib/teamData";
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
} from "./coachDashboardHelpers";
import QuickActions from "./QuickActions";
import styles from "./Home.module.css";

function actorFirstName(actor: TeamActor): string {
  if (actor.kind === "public") return "there";
  return actor.session.name.split(" ")[0] || "there";
}

/** Amount raised / display goal / progress / donor count / top fundraiser —
 *  no new query: raisedCents/goalCents/donorCount already came through
 *  page.tsx's existing Promise.all, and topAthleteName is
 *  fundraiserSummary.topAthleteName, already fetched there too (it was
 *  threaded to HomeView/mobile's FundraiserSnapshot but never read by
 *  CoachDashboard — this revision is the first place on desktop that
 *  uses it). Leaderboard/outreach data beyond that single name is still
 *  explicitly deferred to a later fundraising-focused desktop phase.
 *
 *  Phase 4 revision: promoted from an ordinary info-card to a full-width
 *  hero band (large stat type, tinted panel, thin team-color rule) per
 *  the explicit feedback that Home needed one genuine visual focal
 *  point. Color still comes from var(--team-primary) (the Phase 2/3
 *  theming pipeline, which respects branding_customized) — unchanged
 *  from the prior pass's fix, not regressed.
 *
 *  Phase 4 final revision: this card is now ALWAYS rendered (the
 *  shouldShowFundraisingCard gate that used to hide it entirely at
 *  raisedCents===0 has been removed from coachDashboardHelpers.ts) — at
 *  $0 it shows the same $0/goal/0%-progress layout plus "Ready to start
 *  raising?" instead of the module disappearing. CoachDashboard is
 *  coach-only (gated by shouldShowCoachDashboard upstream), so this
 *  card's $0 copy is always the staff variant — the member-facing
 *  variant lives in HomeView's FundraiserSnapshot. */
function FundraisingCard({
  slug,
  raisedCents,
  goalCents,
  donorCount,
  topAthleteName,
}: {
  slug: string;
  raisedCents: number;
  goalCents: number;
  donorCount: number;
  topAthleteName: string | null;
}) {
  const pct = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;
  const hasRaised = raisedCents > 0;
  return (
    <Link
      href={`/team/${slug}/fundraiser`}
      className={`${styles.fundraisingHero} elf-focus-ring`}
      style={{ display: "block", textDecoration: "none" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-4)" }}>
        <div style={{ minWidth: 0 }}>
          <div className={styles.sectionKicker}>Fundraising</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
            <div style={{ fontWeight: 800, fontSize: "var(--text-5xl)", color: "var(--text-primary-app)", lineHeight: 1, letterSpacing: "-.02em" }}>
              {fmtMoney(raisedCents)}
            </div>
            {goalCents > 0 && (
              <div style={{ fontSize: "var(--text-base)", color: "var(--text-muted-app)", fontWeight: 600 }}>of {fmtMoney(goalCents)} goal</div>
            )}
          </div>
        </div>
        {goalCents > 0 && (
          <div style={{
            flexShrink: 0, fontWeight: 800, fontSize: "var(--text-2xl)", color: "var(--team-primary-foreground)",
            background: "var(--team-primary)", borderRadius: "var(--radius-lg)", padding: "var(--space-2) var(--space-4)", lineHeight: 1,
          }}>
            {pct}%
          </div>
        )}
      </div>

      {goalCents > 0 && (
        <div style={{ background: "var(--border-app)", borderRadius: "var(--radius-full)", height: 10, overflow: "hidden", margin: "var(--space-5) 0 var(--space-3)" }}>
          <div style={{ background: "var(--team-primary)", height: "100%", width: `${pct}%`, borderRadius: "var(--radius-full)", transition: "width .5s ease" }} />
        </div>
      )}

      {hasRaised ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", fontSize: "var(--text-sm)", color: "var(--text-secondary-app)", fontWeight: 600 }}>
          <span>{donorCount} donor{donorCount !== 1 ? "s" : ""}</span>
          {topAthleteName && (
            <>
              <span aria-hidden="true" style={{ color: "var(--border-app)" }}>·</span>
              <span>Top fundraiser: {topAthleteName}</span>
            </>
          )}
        </div>
      ) : (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary-app)", fontWeight: 600 }}>
          Ready to start raising?
        </div>
      )}
    </Link>
  );
}

/** Modest, secondary strip — reuses the exact sponsors data page.tsx
 *  already fetches and passes to HomeView (previously threaded through
 *  to CoachDashboard's props but never rendered there; mobile
 *  HomeContent has always shown it). Deliberately placed last/full-width
 *  and kept visually quiet — the explicit feedback was that sponsors
 *  should not consume prime dashboard space. */
function SponsorsStrip({ slug, sponsors }: { slug: string; sponsors: SponsorRow[] }) {
  if (sponsors.length === 0) return null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
        <span className={styles.sectionKicker}>Our Sponsors</span>
        <Link href={`/team/${slug}/sponsors`} className={`${styles.sectionLink} elf-focus-ring`}>
          View All →
        </Link>
      </div>
      <div style={{ display: "flex", gap: "var(--space-3)", overflowX: "auto", paddingBottom: 2 }}>
        {sponsors.slice(0, 8).map(s => (
          <a
            key={s.id}
            href={s.url || `/team/${slug}/sponsors`}
            target={s.url ? "_blank" : undefined}
            rel={s.url ? "noopener noreferrer" : undefined}
            className="elf-focus-ring"
            style={{
              flexShrink: 0, width: 72, display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-1)",
              textDecoration: "none", padding: "var(--space-2)", border: "1px solid var(--border-app)", borderRadius: "var(--radius-md)",
            }}
          >
            {s.logo_url ? (
              <img src={s.logo_url} alt={s.name} style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 6 }} />
            ) : (
              <div style={{
                width: 36, height: 36, borderRadius: 6, background: "var(--surface-light-elevated)",
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "var(--team-primary)",
              }}>
                {s.name.trim()[0]?.toUpperCase() ?? "S"}
              </div>
            )}
            <span style={{
              fontSize: "10px", fontWeight: 700, color: "var(--text-muted-app)", textAlign: "center", lineHeight: 1.2,
              overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
            }}>
              {s.name}
            </span>
          </a>
        ))}
      </div>
    </div>
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
            ? `${summary.athleteRequests} athlete · ${summary.commentApprovals} comment · ${summary.parentAccessRequests} parent`
            : "You're all caught up"}
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
  topAthleteName?: string | null;
  sponsors?: SponsorRow[];
  logoUrl?: string | null;
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
  topAthleteName = null,
  sponsors = [],
  logoUrl,
  pendingRequestSummary,
  schoolName,
  sportName,
  season,
}: CoachDashboardProps) {
  const [viewingEvent, setViewingEvent] = useState<CalendarEventRow | null>(null);

  const quickActions = buildQuickActions(slug, actor);
  const requestsData = pendingRequestSummary ? resolveRequestsCardData(actor, pendingRequestSummary) : null;
  const upcoming = initialUpcoming.slice(0, 5);
  // First item gets its own "Latest Update" treatment; the rest form the
  // dense Recent Activity feed below it — real data, one existing query,
  // no separate donation-activity fetch invented for this revision.
  const [latestAnnouncement, ...restAnnouncements] = initialAnnouncements;
  const recentAnnouncements = restAnnouncements.slice(0, 4);

  const teamContext = [schoolName, sportName].filter(Boolean).join(" · ") + (season ? ` · ${season}` : "");

  return (
    <div className={styles.dashboardShell} style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* 1 — Team status / identity (compact, no oversized hero) */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-6)" }}>
        {logoUrl && (
          <img src={logoUrl} alt="" style={{ width: 44, height: 44, borderRadius: "var(--radius-md)", objectFit: "cover", flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div className={styles.sectionKicker}>Team Dashboard</div>
          <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em" }}>
            Welcome back, {actorFirstName(actor)}
          </h1>
          {teamContext && (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary-app)", marginTop: 2 }}>{teamContext}</div>
          )}
        </div>
      </div>

      <div className={styles.mainGrid}>
        {/* Fundraising — full-width hero, the page's primary focal point.
            Always rendered (never collapses at $0 — see FundraisingCard). */}
        <div className={styles.fundraisingArea}>
          <FundraisingCard slug={slug} raisedCents={raisedCents} goalCents={goalCents} donorCount={donorCount} topAthleteName={topAthleteName} />
        </div>

        {/* Quick actions — compact icon tiles, top-right beside fundraising */}
        <div className={styles.actionsArea}>
          <h2 className={styles.sectionHeading} style={{ fontSize: "var(--text-base)", marginBottom: "var(--space-2)" }}>Quick Actions</h2>
          <QuickActions actions={quickActions} />
        </div>

        {/* LEFT / MAIN — latest update + recent activity feed */}
        <div className={styles.mainColumn}>
          {latestAnnouncement && (
            <div>
              <div className={styles.sectionKicker} style={{ marginBottom: "var(--space-1)" }}>Latest Team Update</div>
              <div className="elf-surface-card" style={{ borderLeft: `4px solid ${(CATEGORY_STYLE[latestAnnouncement.category] ?? CATEGORY_STYLE["team"]).accent}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                  <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text-primary-app)" }}>{latestAnnouncement.author_name}</span>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted-app)" }}>{relativeTime(latestAnnouncement.created_at)}</span>
                </div>
                <div style={{ fontWeight: 800, fontSize: "var(--text-lg)", color: "var(--text-primary-app)", marginBottom: latestAnnouncement.body ? "var(--space-1)" : 0 }}>
                  {latestAnnouncement.title}
                </div>
                {latestAnnouncement.body && (
                  <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary-app)", lineHeight: 1.55 }}>
                    {latestAnnouncement.body}
                  </p>
                )}
              </div>
            </div>
          )}

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
              <h2 className={styles.sectionHeading}>Recent Activity</h2>
              <Link href={`/team/${slug}/communications?tab=updates`} className={`${styles.sectionLink} elf-focus-ring`}>
                View Communications →
              </Link>
            </div>
            {!latestAnnouncement ? (
              <div className="elf-empty-state">No announcements yet.</div>
            ) : recentAnnouncements.length === 0 ? (
              <div className="elf-empty-state">Nothing else recent.</div>
            ) : (
              <div className="elf-section-flat" style={{ padding: 0 }}>
                {recentAnnouncements.map(a => <CompactAnnouncementRow key={a.id} a={a} />)}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT / SECONDARY — next event, needs attention */}
        <div className={styles.sideColumn}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
              <h2 className={styles.sectionHeading} style={{ fontSize: "var(--text-base)" }}>Next Event</h2>
              <Link href={`/team/${slug}/calendar`} className={`${styles.sectionLink} elf-focus-ring`}>
                View Calendar →
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <div className="elf-empty-state">
                <CalendarPlusIcon aria-hidden="true" size={20} strokeWidth={1.75} />
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-secondary-app)" }}>No upcoming events</div>
                <Link href={`/team/${slug}/calendar`} className="elf-btn elf-btn-secondary elf-focus-ring" style={{ marginTop: "var(--space-1)", padding: "var(--space-1) var(--space-3)", fontSize: "var(--text-xs)" }}>
                  + Add Event
                </Link>
              </div>
            ) : (
              <div className="elf-section-flat" style={{ padding: 0 }}>
                {upcoming.slice(0, 3).map(ev => <UpcomingEventRow key={ev.id} ev={ev} onOpen={setViewingEvent} />)}
              </div>
            )}
          </div>

          <div>
            <h2 className={styles.sectionHeading} style={{ fontSize: "var(--text-base)", marginBottom: "var(--space-2)" }}>Needs Attention</h2>
            <div className="elf-section-flat" style={{ padding: 0 }}>
              {requestsData && <RequestsEntry slug={slug} summary={requestsData} />}
              <MessagesEntry slug={slug} />
            </div>
          </div>
        </div>

        {/* Sponsors — modest, full-width, bottom of the page */}
        <div className={styles.sponsorsArea}>
          <SponsorsStrip slug={slug} sponsors={sponsors} />
        </div>
      </div>

      {viewingEvent && (
        <EventDetailsModal ev={viewingEvent} canManage={false} onClose={() => setViewingEvent(null)} />
      )}
    </div>
  );
}
