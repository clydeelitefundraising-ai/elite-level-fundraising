"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import type { AnnouncementRow, CalendarEventRow } from "@/lib/teamData";
import { isStaff, isHeadCoach, staffRoleLabel, type TeamActor } from "@/lib/permissions";
import {
  CATEGORY_STYLE,
  relativeTime,
  UpcomingEventRow,
  MobileActivityRow,
  RequestsEntryCard,
  FundraiserSnapshot,
} from "@/app/team/[slug]/home/HomeView";
import { buildQuickActions } from "@/app/team/[slug]/home/coachDashboardHelpers";
import homeStyles from "@/app/team/[slug]/home/Home.module.css";
import CoachBar from "@/app/team/[slug]/_components/CoachBar";
import EventDetailsModal from "@/app/team/[slug]/_components/EventDetailsModal";
import Avatar from "@/app/team/[slug]/messages/_shared/Avatar";
import { DEMO_FUNDRAISER, DEMO_SLUG, isVisibleToDemoRole } from "./demoData";
import type { DemoRole } from "./demoProtocol";

// The Team App's mobile Home (HomeContent in home/HomeView.tsx), rendered
// with fictional data. Module order, headings and role gates are the real
// ones: Fundraiser Snapshot (fundraising is on for the demo team), Quick
// Actions from the real buildQuickActions(), Requests (Head Coach only),
// Next Up (three events), Team Communications (latest update) and Recent
// Activity. HomeContent itself isn't mounted — it posts, edits and deletes
// through the API and reads localStorage — so this composes its parts:
//
//   reused as-is  FundraiserSnapshot, RequestsEntryCard, UpcomingEventRow,
//                 MobileActivityRow, CoachBar, EventDetailsModal, Avatar,
//                 CATEGORY_STYLE, relativeTime, Home.module.css
//   twins         AnnouncementCard (the real one marks updates "seen" via
//                 the API) and QuickActions (the real one uses next/link)
//
// Anything that would save or navigate away is handled by TeamAppDemo
// (anchor clicks are intercepted; buttons call onPreviewOnly).

type Props = {
  role: DemoRole;
  actor: TeamActor;
  announcements: AnnouncementRow[];
  upcoming: CalendarEventRow[];
  onPreviewOnly: (message?: string) => void;
};

export default function DemoHome({ role, actor, announcements, upcoming, onPreviewOnly }: Props) {
  const isStaffViewer = isStaff(actor);
  const canEdit = isStaffViewer;
  const canDelete = isHeadCoach(actor);
  const isHeadCoachViewer = isHeadCoach(actor);
  const [viewingEvent, setViewingEvent] = useState<CalendarEventRow | null>(null);

  const items = announcements.filter(a => isVisibleToDemoRole(a, role));
  const next3 = upcoming.slice(0, 3);
  const pinned = items.filter(a => a.priority === "pinned");
  const nonPinned = items.filter(a => a.priority !== "pinned");
  const ordered = [...pinned, ...nonPinned];
  const latestAnnouncement = ordered[0] ?? null;
  const recentAnnouncements = ordered.slice(1, 5);
  const quickActions = buildQuickActions(DEMO_SLUG, actor);

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <FundraiserSnapshot
        slug={DEMO_SLUG}
        raisedCents={DEMO_FUNDRAISER.raisedCents}
        goalCents={DEMO_FUNDRAISER.goalCents}
        topAthleteName={null}
        isStaffViewer={isStaffViewer}
      />

      {quickActions.length > 0 && (
        <div style={{ marginBottom: ".8rem" }}>
          <span className={homeStyles.sectionKicker} style={{ display: "block", marginBottom: ".4rem" }}>
            Quick Actions
          </span>
          {/* Twin of home/QuickActions.tsx — plain anchors instead of next/link. */}
          <div className={homeStyles.quickActions}>
            {quickActions.map(action => {
              const Icon = action.icon;
              return (
                <a
                  key={action.key}
                  href={action.href}
                  className={`elf-surface-card elf-focus-ring ${homeStyles.actionTile}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <Icon aria-hidden="true" size={22} strokeWidth={2} color="var(--team-primary)" className={homeStyles.actionIcon} />
                  <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text-primary-app)" }}>{action.label}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {isHeadCoachViewer && <RequestsEntryCard slug={DEMO_SLUG} count={0} />}

      <div className="elf-section-flat" style={{ padding: ".2rem 0 .5rem", marginBottom: ".8rem" }}>
        <h2 className={homeStyles.sectionKicker} style={{ display: "block", marginBottom: ".2rem" }}>
          Next Up
        </h2>
        {next3.map((ev, i) => (
          <div key={ev.id} style={i === next3.length - 1 ? { borderBottom: "none" } : {}}>
            <UpcomingEventRow ev={ev} onOpen={setViewingEvent} />
          </div>
        ))}
      </div>

      <div style={{ marginBottom: ".5rem" }}>
        <span className={homeStyles.sectionKicker} style={{ display: "block", marginBottom: ".1rem" }}>
          Team Update
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team Communications
          </h2>
          <div style={{ flex: 1 }} />
          <CoachBar show={canEdit} label="Post" onAdd={() => onPreviewOnly("Preview only — in the real app, coaches post an update to the team here.")} />
        </div>
      </div>

      {latestAnnouncement && (
        <DemoAnnouncementCard
          a={latestAnnouncement}
          canEdit={canEdit}
          canDelete={canDelete}
          onEdit={() => onPreviewOnly()}
          onDelete={() => onPreviewOnly()}
        />
      )}
      <a
        href={`/team/${DEMO_SLUG}/communications?tab=updates`}
        className="elf-focus-ring"
        style={{
          display: "block",
          textAlign: "center",
          padding: ".55rem",
          marginTop: ".1rem",
          marginBottom: ".8rem",
          fontSize: ".75rem",
          fontWeight: 700,
          color: "var(--text-secondary-app)",
          textDecoration: "none",
        }}
      >
        View all updates →
      </a>

      <div style={{ marginTop: ".3rem", marginBottom: ".8rem" }}>
        <span className={homeStyles.sectionKicker} style={{ display: "block", marginBottom: ".3rem" }}>
          Recent Activity
        </span>
        {recentAnnouncements.length === 0 ? (
          <div className="elf-empty-state" style={{ padding: "var(--space-6, 1.25rem) var(--space-4, .75rem)" }}>
            <Activity aria-hidden="true" size={20} strokeWidth={1.75} />
            <div style={{ fontSize: ".8rem", color: "var(--text-muted-app)" }}>
              Team activity will appear here.
            </div>
          </div>
        ) : (
          <div className="elf-section-flat" style={{ padding: 0 }}>
            {recentAnnouncements.map(a => (
              <MobileActivityRow key={a.id} a={a} />
            ))}
          </div>
        )}
      </div>

      {viewingEvent && (
        <EventDetailsModal
          ev={viewingEvent}
          canManage={false}
          onClose={() => setViewingEvent(null)}
        />
      )}
    </div>
  );
}

// Twin of HomeView.tsx's AnnouncementCard, minus useSeenTracker (which
// POSTs a "seen" receipt to the API) and the attachment download link (the
// demo's updates have no attachments). teamAppDemo.test.ts checks the
// remaining style declarations still match the real card.
function DemoAnnouncementCard({
  a,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  a: AnnouncementRow;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (a: AnnouncementRow) => void;
  onDelete: (id: string) => void;
}) {
  const cat         = CATEGORY_STYLE[a.category] ?? CATEGORY_STYLE["team"];
  const isPinned    = a.priority === "pinned";
  const isHigh      = a.priority === "high";
  const accentColor = isPinned ? "#6366f1" : isHigh ? "var(--color-error)" : cat.accent;
  const role        = staffRoleLabel(a.author_role ?? "");
  const isHead      = (a.author_role ?? "").includes("head");

  return (
    <div
      className="elf-surface-card"
      style={{
        padding: ".8rem .95rem .75rem .85rem",
        borderLeft: `4px solid ${accentColor}`,
        marginBottom: ".55rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".35rem" }}>
        <Avatar name={a.author_name} photoUrl={a.author_photo_url} size={30} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: ".3rem" }}>
          <span style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--text-primary-app)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {a.author_name}
          </span>
          {role && (
            <span style={{
              padding: ".06rem .34rem", borderRadius: 100, fontSize: ".52rem", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: ".04em",
              background: isHead ? "#dbeafe" : "#f3f4f6",
              color:      isHead ? "#1d4ed8" : "var(--text-secondary-app)",
              flexShrink: 0, whiteSpace: "nowrap",
            }}>
              {role}
            </span>
          )}
        </div>
        <span style={{ fontSize: ".66rem", color: "var(--text-muted-app)", flexShrink: 0 }}>{relativeTime(a.created_at)}</span>
      </div>

      <div style={{ display: "flex", gap: ".28rem", marginBottom: ".42rem", flexWrap: "wrap" }}>
        <span style={{ padding: ".07rem .38rem", borderRadius: 100, fontSize: ".53rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: cat.bg, color: cat.color }}>
          {a.category.replace("-", " ")}
        </span>
        {isPinned && (
          <span style={{ padding: ".07rem .38rem", borderRadius: 100, fontSize: ".53rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: "#ede9fe", color: "#4338ca" }}>
            Pinned
          </span>
        )}
        {isHigh && !isPinned && (
          <span style={{ padding: ".07rem .38rem", borderRadius: 100, fontSize: ".53rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: "#fee2e2", color: "var(--color-error)" }}>
            Important
          </span>
        )}
      </div>

      <p style={{ margin: "0 0 .22rem", fontWeight: 800, fontSize: "1rem", color: "var(--text-primary-app)", lineHeight: 1.3 }}>
        {a.title}
      </p>

      {a.body && (
        <p style={{ margin: 0, fontSize: ".82rem", color: "var(--text-secondary-app)", lineHeight: 1.62 }}>
          {a.body}
        </p>
      )}

      {canEdit && (
        <div style={{ display: "flex", gap: ".15rem", justifyContent: "flex-end", marginTop: ".38rem" }}>
          <button
            onClick={() => onEdit(a)}
            className="elf-focus-ring"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "var(--text-muted-app)", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
          >
            Edit
          </button>
          {canDelete && (
            <button
              onClick={() => onDelete(a.id)}
              className="elf-focus-ring"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#fca5a5", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
