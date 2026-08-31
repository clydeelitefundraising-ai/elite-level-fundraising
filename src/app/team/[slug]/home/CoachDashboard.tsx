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

const CARD_STYLE: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
};

const KICKER_STYLE: React.CSSProperties = {
  fontSize: ".62rem", fontWeight: 700, color: "#9ca3af",
  textTransform: "uppercase", letterSpacing: ".09em",
};

function actorFirstName(actor: TeamActor): string {
  if (actor.kind === "public") return "there";
  return actor.session.name.split(" ")[0] || "there";
}

/** Amount raised / display goal / progress / donor count — the same
 *  fields (and the same "hide entirely until something's been raised"
 *  rule) as the existing mobile FundraiserSnapshot. No new query, no
 *  leaderboard/outreach/top-athlete data — those are explicitly deferred
 *  to a later fundraising-focused desktop phase. */
function FundraisingCard({
  slug,
  raisedCents,
  goalCents,
  donorCount,
  primaryColor,
}: {
  slug: string;
  raisedCents: number;
  goalCents: number;
  donorCount: number;
  primaryColor: string;
}) {
  const pct = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;
  return (
    <Link href={`/team/${slug}/fundraiser`} style={{ ...CARD_STYLE, display: "block", padding: "1rem 1.1rem", textDecoration: "none" }}>
      <div style={KICKER_STYLE}>Fundraising</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: ".6rem", marginTop: ".3rem" }}>
        <div style={{ fontWeight: 800, fontSize: "1.6rem", color: "#0b1e3d", lineHeight: 1 }}>{fmtMoney(raisedCents)}</div>
        {goalCents > 0 && (
          <div style={{ fontSize: ".82rem", color: "#9ca3af" }}>of {fmtMoney(goalCents)}</div>
        )}
      </div>
      {goalCents > 0 && (
        <div style={{ background: "#eaecef", borderRadius: 100, height: 7, overflow: "hidden", margin: ".55rem 0 .4rem" }}>
          <div style={{ background: primaryColor, height: "100%", width: `${pct}%`, borderRadius: 100 }} />
        </div>
      )}
      <div style={{ fontSize: ".76rem", color: "#6b7280" }}>
        {goalCents > 0 && `${pct}% of goal · `}{donorCount} donor{donorCount !== 1 ? "s" : ""}
      </div>
    </Link>
  );
}

/** Head-Coach/Platform-Admin only (see resolveRequestsCardData — the
 *  card itself is simply absent for an Assistant Coach, not
 *  disabled/placeholder). No approve/decline controls — clicking goes to
 *  the existing Requests Center. */
function RequestsCard({ slug, summary }: { slug: string; summary: PendingRequestSummary }) {
  return (
    <Link href={`/team/${slug}/requests`} style={{ ...CARD_STYLE, display: "block", padding: "1rem 1.1rem", textDecoration: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={KICKER_STYLE}>Requests</div>
        {summary.total > 0 && (
          <span style={{ background: "#dc2626", color: "#fff", borderRadius: 100, fontSize: ".65rem", fontWeight: 700, padding: ".1rem .5rem" }}>
            {summary.total}
          </span>
        )}
      </div>
      <div style={{ fontWeight: 800, fontSize: "1.6rem", color: "#0b1e3d", marginTop: ".3rem", lineHeight: 1 }}>
        {summary.total === 0 ? "All clear" : `${summary.total} waiting`}
      </div>
      <div style={{ fontSize: ".76rem", color: "#6b7280", marginTop: ".4rem" }}>
        {summary.athleteRequests} athlete request{summary.athleteRequests !== 1 ? "s" : ""} · {summary.commentApprovals} comment approval{summary.commentApprovals !== 1 ? "s" : ""}
      </div>
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
function MessagesCard({ slug }: { slug: string }) {
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
    <Link href={`/team/${slug}/messages`} style={{ ...CARD_STYLE, display: "block", padding: "1rem 1.1rem", textDecoration: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={KICKER_STYLE}>Messages</div>
        {display > 0 && (
          <span style={{ background: "#dc2626", color: "#fff", borderRadius: 100, fontSize: ".65rem", fontWeight: 700, padding: ".1rem .5rem" }}>
            {display}
          </span>
        )}
      </div>
      <div style={{ fontWeight: 800, fontSize: "1.6rem", color: "#0b1e3d", marginTop: ".3rem", lineHeight: 1 }}>
        {display === 0 ? "All read" : `${display} unread`}
      </div>
      <div style={{ fontSize: ".76rem", color: "#6b7280", marginTop: ".4rem" }}>
        View conversations →
      </div>
    </Link>
  );
}

/** Compact, non-interactive announcement summary — deliberately NOT the
 *  full AnnouncementCard: that component carries its own
 *  useSeenTracker/edit/delete wiring, which this preview should not
 *  duplicate (see the D2 design plan on why mounting a second seen-
 *  tracking instance for the same announcement is unnecessary here). */
function CompactAnnouncementRow({ a }: { a: AnnouncementRow }) {
  const cat = CATEGORY_STYLE[a.category] ?? CATEGORY_STYLE["team"];
  return (
    <div style={{ padding: ".7rem 0", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".25rem" }}>
        <span style={{
          background: cat.bg, color: cat.color, borderRadius: 100,
          fontSize: ".6rem", fontWeight: 700, padding: ".08rem .5rem", textTransform: "uppercase", letterSpacing: ".03em",
        }}>
          {a.category.replace("-", " ")}
        </span>
        <span style={{ fontSize: ".72rem", color: "#9ca3af" }}>{relativeTime(a.created_at)}</span>
      </div>
      <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#0b1e3d", marginBottom: ".15rem" }}>{a.title}</div>
      <div style={{ fontSize: ".78rem", color: "#6b7280" }}>{a.author_name}</div>
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
  primaryColor = "#0b1e3d",
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
      {/* Header */}
      <div style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em" }}>
          Welcome back, {actorFirstName(actor)}
        </h1>
        {teamContext && (
          <div style={{ fontSize: ".85rem", color: "#6b7280", marginTop: ".2rem" }}>{teamContext}</div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: "1.25rem" }}>
        <QuickActions actions={quickActions} />
      </div>

      {/* Attention / KPI row */}
      <div className={styles.kpiGrid} style={{ marginBottom: "1.25rem" }}>
        {showFundraising && (
          <FundraisingCard slug={slug} raisedCents={raisedCents} goalCents={goalCents} donorCount={donorCount} primaryColor={primaryColor} />
        )}
        {requestsData && <RequestsCard slug={slug} summary={requestsData} />}
        <MessagesCard slug={slug} />
      </div>

      {/* Main content */}
      <div className={styles.mainGrid}>
        {/* Upcoming */}
        <div style={{ ...CARD_STYLE, padding: "1rem 1.1rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".5rem" }}>
            <h2 style={{ margin: 0, fontSize: ".95rem", fontWeight: 800, color: "#0b1e3d" }}>Upcoming</h2>
            <Link href={`/team/${slug}/calendar`} style={{ fontSize: ".78rem", fontWeight: 700, color: "#0b1e3d", textDecoration: "none" }}>
              View Calendar →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <div style={{ fontSize: ".82rem", color: "#9ca3af", padding: "1rem 0" }}>Nothing scheduled yet.</div>
          ) : (
            upcoming.map(ev => <UpcomingEventRow key={ev.id} ev={ev} onOpen={setViewingEvent} />)
          )}
        </div>

        {/* Recent Team Activity */}
        <div style={{ ...CARD_STYLE, padding: "1rem 1.1rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".5rem" }}>
            <h2 style={{ margin: 0, fontSize: ".95rem", fontWeight: 800, color: "#0b1e3d" }}>Recent Team Activity</h2>
            <Link href={`/team/${slug}/communications?tab=updates`} style={{ fontSize: ".78rem", fontWeight: 700, color: "#0b1e3d", textDecoration: "none" }}>
              View Communications →
            </Link>
          </div>
          {recentAnnouncements.length === 0 ? (
            <div style={{ fontSize: ".82rem", color: "#9ca3af", padding: "1rem 0" }}>No announcements yet.</div>
          ) : (
            recentAnnouncements.map(a => <CompactAnnouncementRow key={a.id} a={a} />)
          )}
        </div>
      </div>

      {viewingEvent && (
        <EventDetailsModal ev={viewingEvent} canManage={false} onClose={() => setViewingEvent(null)} />
      )}
    </div>
  );
}
