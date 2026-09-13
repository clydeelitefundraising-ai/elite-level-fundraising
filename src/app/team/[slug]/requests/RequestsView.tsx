"use client";

import { useState } from "react";
import { UserPlus, MessageSquare, CheckCircle, Users, Flag } from "lucide-react";
import type { TeamAthleteRow } from "@/lib/teamData";
import AthleteRequestsPanel from "./AthleteRequestsPanel";
import CommentApprovalsPanel from "./CommentApprovalsPanel";
import ParentAccessRequestsPanel from "./ParentAccessRequestsPanel";
import ReportsPanel from "./ReportsPanel";
import styles from "./Requests.module.css";

// ── Section wrapper (Phase 3B-1, retokenized Phase 8B) ──────────────────────
//
// Deliberately a plain presentational wrapper, not a request-type registry
// or workflow engine — Phase 3B-2 (Comment Approvals) adds itself by
// rendering a second <RequestSection> here, the same way this one was
// added. Nothing about this shape assumes "athlete requests" specifically.
function RequestSection({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>
          {icon}
          {title}
        </h3>
        {count > 0 && <span className={styles.sectionBadge}>{count}</span>}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <div className={styles.emptyRow}>{message}</div>;
}

export default function RequestsView({
  slug,
  rosterAthletes,
}: {
  slug: string;
  rosterAthletes: TeamAthleteRow[];
}) {
  // null = not yet loaded (each panel calls onCountChange once its own
  // fetch resolves, same as before Phase 8B). Distinguishing "not loaded
  // yet" from "loaded and zero" is what lets the unified caught-up state
  // below only appear once BOTH categories are confirmed empty, rather
  // than flashing on the initial render before either panel has fetched.
  const [athleteRequestCount, setAthleteRequestCount] = useState<number | null>(null);
  const [commentApprovalCount, setCommentApprovalCount] = useState<number | null>(null);
  const [parentAccessRequestCount, setParentAccessRequestCount] = useState<number | null>(null);
  const [reportCount, setReportCount] = useState<number | null>(null);

  const bothLoaded = athleteRequestCount !== null && commentApprovalCount !== null && parentAccessRequestCount !== null && reportCount !== null;
  const bothEmpty = bothLoaded && athleteRequestCount === 0 && commentApprovalCount === 0 && parentAccessRequestCount === 0 && reportCount === 0;
  const totalCount = (athleteRequestCount ?? 0) + (commentApprovalCount ?? 0) + (parentAccessRequestCount ?? 0) + (reportCount ?? 0);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Head Coach</span>
        <h2 className={styles.title}>Requests</h2>
        <p className={styles.subtitle}>
          {bothLoaded
            ? totalCount > 0
              ? `${totalCount} need${totalCount === 1 ? "s" : ""} your attention`
              : "You're all caught up."
            : "Review items that need your approval."}
        </p>
        <div className={styles.chipRow}>
          <span className={styles.chip}>
            <UserPlus size={13} strokeWidth={2} />
            Athletes
            <span className={styles.chipCount}>{athleteRequestCount ?? 0}</span>
          </span>
          <span className={styles.chip}>
            <MessageSquare size={13} strokeWidth={2} />
            Comments
            <span className={styles.chipCount}>{commentApprovalCount ?? 0}</span>
          </span>
          <span className={styles.chip}>
            <Users size={13} strokeWidth={2} />
            Parents
            <span className={styles.chipCount}>{parentAccessRequestCount ?? 0}</span>
          </span>
          <span className={styles.chip}>
            <Flag size={13} strokeWidth={2} />
            Reports
            <span className={styles.chipCount}>{reportCount ?? 0}</span>
          </span>
        </div>
      </div>

      {bothEmpty ? (
        <div className={styles.unifiedEmpty}>
          <CheckCircle size={28} strokeWidth={1.75} className={styles.unifiedEmptyIcon} />
          <div className={styles.unifiedEmptyTitle}>All Caught Up</div>
          <p className={styles.unifiedEmptyBody}>No athlete requests, comments, or reports need review.</p>
        </div>
      ) : (
        <>
          <RequestSection title="Reports" icon={<Flag size={13} strokeWidth={2} />} count={reportCount ?? 0}>
            <ReportsPanel
              slug={slug}
              onCountChange={setReportCount}
              emptyState={<EmptyRow message="No open reports." />}
              hideHeader
            />
          </RequestSection>

          <RequestSection title="Athlete Requests" icon={<UserPlus size={13} strokeWidth={2} />} count={athleteRequestCount ?? 0}>
            <AthleteRequestsPanel
              slug={slug}
              rosterAthletes={rosterAthletes}
              onCountChange={setAthleteRequestCount}
              emptyState={<EmptyRow message="No pending athlete requests." />}
              hideHeader
            />
          </RequestSection>

          <RequestSection title="Comment Approvals" icon={<MessageSquare size={13} strokeWidth={2} />} count={commentApprovalCount ?? 0}>
            <CommentApprovalsPanel
              slug={slug}
              onCountChange={setCommentApprovalCount}
              emptyState={<EmptyRow message="No pending comment approvals." />}
              hideHeader
            />
          </RequestSection>

          <RequestSection title="Parent Access Requests" icon={<Users size={13} strokeWidth={2} />} count={parentAccessRequestCount ?? 0}>
            <ParentAccessRequestsPanel
              slug={slug}
              onCountChange={setParentAccessRequestCount}
              emptyState={<EmptyRow message="No pending parent access requests." />}
              hideHeader
            />
          </RequestSection>
        </>
      )}
    </div>
  );
}
