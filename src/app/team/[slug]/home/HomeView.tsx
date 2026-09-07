"use client";

import { useState, useEffect, useRef } from "react";
import type { AnnouncementRow, CalendarEventRow, SponsorRow } from "@/lib/teamData";
import { isStaff, isHeadCoach, staffRoleLabel, type TeamActor } from "@/lib/permissions";
import { eventTypeStyle, formatDateLabel, displayEventTime } from "@/lib/calendarShared";
import CoachBar from "../_components/CoachBar";
import Modal from "../_components/Modal";
import EventDetailsModal from "../_components/EventDetailsModal";
import Avatar from "../messages/_shared/Avatar";
import { useSeenTracker } from "../_components/useSeenTracker";
import type { PendingRequestSummary } from "@/lib/platform/requests";
import { shouldShowCoachDashboard, buildQuickActions } from "./coachDashboardHelpers";
import CoachDashboard from "./CoachDashboard";
import QuickActions from "./QuickActions";
import styles from "./Home.module.css";

// ── Style tokens ──────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  padding: ".5rem .75rem",
  border: "1.5px solid var(--border-app)",
  borderRadius: 9,
  // 16px minimum — iOS WebKit auto-zooms the viewport when focusing a form
  // control smaller than this (Phase 8).
  fontSize: "1rem",
  width: "100%",
  boxSizing: "border-box",
  color: "var(--text-primary-app)",
  background: "var(--surface-light)",
};

const lbl: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: ".3rem",
  fontSize: ".72rem",
  fontWeight: 700,
  color: "var(--text-secondary-app)",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

// ── Category + event type colors ──────────────────────────────────────────────

// Exported (D2): reused as-is by the desktop CoachDashboard's compact
// announcement summary — pure/stateless, zero behavior change here.
export const CATEGORY_STYLE: Record<string, { bg: string; color: string; accent: string }> = {
  "schedule":   { bg: "#dbeafe", color: "#1d4ed8", accent: "#3b82f6" },
  "fundraiser": { bg: "#fef3c7", color: "#b45309", accent: "#f59e0b" },
  "travel":     { bg: "#ede9fe", color: "#6d28d9", accent: "#8b5cf6" },
  "meet-info":  { bg: "#ccfbf1", color: "#0f766e", accent: "#14b8a6" },
  "team-alert": { bg: "#fee2e2", color: "#dc2626", accent: "#ef4444" },
  "team":       { bg: "#f3f4f6", color: "#374151", accent: "#9ca3af" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Exported (D2): reused as-is by the desktop CoachDashboard's Fundraising
// card — pure/stateless, zero behavior change here.
export function fmtMoney(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 10000) return `$${(dollars / 1000).toFixed(0)}k`;
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// Exported (D2): reused as-is by the desktop CoachDashboard's compact
// announcement summary — pure/stateless, zero behavior change here.
export function relativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)     return "just now";
  if (sec < 3600)   return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)  return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function AnnouncementCard({
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
  const att         = a.attachment ?? null;

  // Phase 9: marks this announcement Seen automatically once it's been
  // genuinely visible on screen for a dwell threshold — no tap required.
  const cardRef = useRef<HTMLDivElement>(null);
  useSeenTracker(cardRef, a.campaign_slug, a.id);

  return (
    <div
      ref={cardRef}
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

      {att && (
        <a
          href={`/api/team/${a.campaign_slug}/files/${att.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="elf-focus-ring"
          style={{ display: "flex", alignItems: "center", gap: ".4rem", marginTop: ".5rem", padding: ".45rem .65rem", background: "var(--surface-light-elevated)", border: "1px solid var(--border-app)", borderRadius: 9, textDecoration: "none" }}
        >
          <span style={{ fontSize: ".75rem", fontWeight: 600, color: "var(--text-primary-app)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
            {att.name}
          </span>
          <span style={{ fontSize: ".7rem", color: "var(--text-muted-app)", flexShrink: 0 }}>↓</span>
        </a>
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

// Exported (D2): reused as-is by the desktop CoachDashboard's Upcoming
// card — same row component, same EventDetailsModal, zero behavior
// change here (mobile HomeContent's own usage below is untouched).
export function UpcomingEventRow({ ev, onOpen }: { ev: CalendarEventRow; onOpen: (ev: CalendarEventRow) => void }) {
  const s = eventTypeStyle(ev.type);
  const time = displayEventTime(ev);
  return (
    <button
      onClick={() => onOpen(ev)}
      className="elf-list-row elf-focus-ring"
      style={{
        width: "100%", border: "none", borderBottom: "1px solid var(--border-app)",
        background: "none", cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit",
      }}
    >
      <div style={{ flexShrink: 0, width: 44, textAlign: "center" }}>
        <div style={{ fontSize: ".62rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".06em" }}>
          {formatDateLabel(ev.event_date).slice(0, 3)}
        </div>
        <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--text-primary-app)", lineHeight: 1.1 }}>
          {ev.event_date.split("-")[2]}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: ".18rem" }}>
          <span style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-primary-app)" }}>{ev.title}</span>
          <span style={{ padding: ".08rem .42rem", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", background: s.bg, color: s.color, flexShrink: 0 }}>
            {ev.type}
          </span>
        </div>
        {(time || ev.location) && (
          <div style={{ fontSize: ".78rem", color: "var(--text-muted-app)" }}>
            {[time, ev.location].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Requests entry point (Phase 3B-1, Head Coach only) ─────────────────────
//
// Deliberately NOT the approval cards themselves — this is only a link to
// the dedicated Requests Center (/team/[slug]/requests), per the explicit
// product requirement that Home never render approve/decline controls
// directly. Stays visible at zero (not hidden/collapsed) so the feature
// remains discoverable, but drops the alarming red badge when there's
// nothing pending. Flat list row, not a floating card — an approvals
// count is a status line, not content that needs its own visual grouping.
function RequestsEntryCard({ slug, count }: { slug: string; count: number }) {
  const hasPending = count > 0;
  return (
    <a
      href={`/team/${slug}/requests`}
      className="elf-list-row elf-focus-ring"
      style={{
        textDecoration: "none", color: "inherit",
        background: "var(--surface-light)", borderRadius: "var(--radius-lg)",
        padding: ".7rem .9rem", marginBottom: ".8rem",
        border: "1px solid var(--border-app)",
        borderLeft: hasPending ? "3px solid var(--color-error)" : "3px solid transparent",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
          <span style={{ fontWeight: 800, fontSize: ".92rem", color: "var(--text-primary-app)" }}>Requests</span>
          {hasPending && (
            <span className="elf-badge" style={{ background: "var(--color-error)", color: "#fff" }}>
              {count}
            </span>
          )}
        </div>
        <div style={{ fontSize: ".76rem", color: "var(--text-muted-app)", marginTop: ".1rem" }}>
          {hasPending
            ? `Athlete and team approval${count !== 1 ? "s" : ""} waiting`
            : "No pending requests"}
        </div>
      </div>
      <span style={{ fontSize: ".9rem", color: "var(--text-muted-app)", flexShrink: 0 }}>→</span>
    </a>
  );
}

/** Phase 4: color now comes from var(--team-primary) instead of the raw
 *  primaryColor prop — see the identical note on CoachDashboard's
 *  FundraisingCard. This keeps the mobile and desktop fundraising
 *  snapshots consistent with the branding_customized theming pipeline
 *  instead of one of them silently bypassing it. This is the strongest
 *  single visual emphasis point on mobile Home, per the design brief. */
function FundraiserSnapshot({
  slug,
  raisedCents,
  goalCents,
}: {
  slug: string;
  raisedCents: number;
  goalCents: number;
  topAthleteName: string | null;
}) {
  if (raisedCents === 0) return null;

  const pct = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;

  return (
    <div className="elf-surface-card" style={{ overflow: "hidden", padding: 0, marginBottom: ".8rem" }}>
      <div style={{ padding: ".75rem 1rem", borderBottom: "1px solid var(--border-app)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className={styles.sectionKicker}>Fundraiser</div>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-primary-app)" }}>Team Progress</div>
        </div>
        <a
          href={`/team/${slug}/fundraiser`}
          className="elf-btn-primary elf-focus-ring"
          style={{ padding: ".4rem .9rem", borderRadius: 20, fontSize: ".75rem", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          View Fundraiser →
        </a>
      </div>

      <div style={{ padding: ".85rem 1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".55rem" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.5rem", color: "var(--text-primary-app)", lineHeight: 1 }}>{fmtMoney(raisedCents)}</div>
            <div style={{ fontSize: ".62rem", color: "var(--text-muted-app)", marginTop: ".12rem" }}>raised</div>
          </div>
          {goalCents > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: ".95rem", color: "var(--text-secondary-app)" }}>{fmtMoney(goalCents)}</div>
              <div style={{ fontSize: ".62rem", color: "var(--text-muted-app)", marginTop: ".12rem" }}>goal</div>
            </div>
          )}
        </div>

        {goalCents > 0 && (
          <div>
            <div style={{ background: "var(--border-app)", borderRadius: 100, height: 8, overflow: "hidden", marginBottom: ".3rem" }}>
              <div style={{ background: "var(--team-primary)", height: "100%", width: `${pct}%`, borderRadius: 100, transition: "width .5s ease" }} />
            </div>
            <div style={{ fontSize: ".65rem", color: "var(--text-muted-app)", textAlign: "right" }}>{pct}% of goal</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type AForm = {
  title: string;
  body: string;
  category: string;
  priority: "normal" | "high" | "pinned";
};

const BLANK: AForm = { title: "", body: "", category: "team", priority: "normal" };

type HomeViewProps = {
  slug: string;
  initialAnnouncements: AnnouncementRow[];
  initialUpcoming: CalendarEventRow[];
  actor: TeamActor;
  sponsors?: SponsorRow[];
  raisedCents?: number;
  goalCents?: number;
  topAthleteName?: string | null;
  primaryColor?: string;
  pendingRequestCount?: number;
  // D2 — already fetched by page.tsx (donationStats.donor_count and the
  // full getPendingRequestSummary() result respectively), just newly
  // threaded through here for the desktop Coach Dashboard. Optional so
  // HomeContent (which never reads them) and any other existing caller
  // are unaffected.
  donorCount?: number;
  pendingRequestSummary?: PendingRequestSummary;
  schoolName?: string;
  sportName?: string;
  season?: string;
  // Phase 4 revision: already fetched by page.tsx's getCampaignSettings
  // call — threaded through for the compact identity block on both the
  // desktop dashboard and mobile Home. No new query.
  logoUrl?: string | null;
};

// ── Role-based entry point ──────────────────────────────────────────────────
//
// Desktop Coach Dashboard (D2) — gated on shouldShowCoachDashboard(actor),
// NOT isStaff(): boosters and every member role must keep seeing the
// existing HomeContent at every width, including desktop. For an eligible
// actor, BOTH HomeContent and CoachDashboard are mounted; Home.module.css's
// single 1024px breakpoint (matching the D1 shell's) decides which is
// visible — no window.innerWidth/matchMedia, no hydration-dependent
// branch. HomeContent's own internals are completely unmodified.
export default function HomeView(props: HomeViewProps) {
  if (!shouldShowCoachDashboard(props.actor)) {
    return <HomeContent {...props} />;
  }
  return (
    <>
      <div className={styles.mobileOnly}>
        <HomeContent {...props} />
      </div>
      <div className={styles.desktopOnly}>
        <CoachDashboard {...props} />
      </div>
    </>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────
//
// Serves Athlete, Parent, and Booster alike (plus any coach below the
// desktop-dashboard breakpoint) — the existing production code has never
// branched their module set apart from the isStaff()/isHeadCoach() edit
// and Requests-visibility gates preserved below; Phase 4 does not invent
// new role-specific modules that don't already exist.
function HomeContent({
  slug,
  initialAnnouncements,
  initialUpcoming,
  actor,
  sponsors = [],
  raisedCents = 0,
  goalCents = 0,
  topAthleteName = null,
  pendingRequestCount = 0,
  schoolName,
  sportName,
  season,
  logoUrl,
}: HomeViewProps) {
  const canEdit   = isStaff(actor);
  const canDelete = isHeadCoach(actor);
  // Separately named (rather than reusing canDelete) so the Requests-card
  // gate below reads clearly on its own — same underlying check.
  const isHeadCoachViewer = canDelete;
  const [items,     setItems]     = useState<AnnouncementRow[]>(initialAnnouncements);
  const [form,    setForm]    = useState<AForm>(BLANK);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [unread,  setUnread]  = useState(0);
  const [viewingEvent, setViewingEvent] = useState<CalendarEventRow | null>(null);

  const next3 = initialUpcoming.slice(0, 3);

  useEffect(() => {
    const lastRead = localStorage.getItem(`elf_home_read_${slug}`);
    setUnread(lastRead
      ? items.filter(a => a.created_at > lastRead).length
      : items.length,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openAdd  = () => { setForm(BLANK); setError(""); setShowAdd(true); };
  const openEdit = (a: AnnouncementRow) => {
    setForm({ title: a.title, body: a.body, category: a.category, priority: a.priority });
    setError(""); setEditing(a);
  };
  const closeModal = () => { setShowAdd(false); setEditing(null); setError(""); };

  const handleAdd = async () => {
    if (!form.title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError("");
    const res  = await fetch(`/api/team/${slug}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to post announcement."); return; }
    setItems(prev => [data, ...prev]);
    closeModal();
  };

  const handleEdit = async () => {
    if (!editing || !form.title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError("");
    const res  = await fetch(`/api/team/${slug}/announcements/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to update announcement."); return; }
    setItems(prev => prev.map(a => a.id === editing.id ? { ...a, ...form } : a));
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    const res = await fetch(`/api/team/${slug}/announcements/${id}`, { method: "DELETE" });
    if (res.ok) setItems(prev => prev.filter(a => a.id !== id));
  };

  const pinned    = items.filter(a => a.priority === "pinned");
  const nonPinned = items.filter(a => a.priority !== "pinned");
  const preview   = [...pinned, ...nonPinned].slice(0, 3);

  const isEditing = editing !== null;
  const modalOpen = showAdd || isEditing;

  // Phase 4 revision: every actor who reaches Home (coach or otherwise)
  // already gets a role-appropriate action list from the existing,
  // unmodified buildQuickActions() helper — booster/athlete/parent get
  // Send Message + Manage Team only, since Post/Add Event stay
  // isStaff()-gated inside the helper itself. This just renders that
  // existing, already-role-aware helper on mobile too (it was previously
  // only mounted in the separate desktop CoachDashboard).
  const quickActions = buildQuickActions(slug, actor);
  const teamContext = [schoolName, sportName].filter(Boolean).join(" · ") + (season ? ` · ${season}` : "");

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>

      {/* 0 — Team identity */}
      <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: ".9rem" }}>
        {logoUrl && (
          <img src={logoUrl} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-primary-app)", lineHeight: 1.15 }}>
            {schoolName || "Team Home"}
          </div>
          {teamContext && (
            <div style={{ fontSize: ".72rem", color: "var(--text-secondary-app)", marginTop: 1 }}>{teamContext}</div>
          )}
        </div>
      </div>

      {/* 1 — Fundraiser Snapshot (primary brand-energy moment on mobile) */}
      <FundraiserSnapshot
        slug={slug}
        raisedCents={raisedCents}
        goalCents={goalCents}
        topAthleteName={topAthleteName}
      />

      {/* 2 — Quick Actions */}
      {quickActions.length > 0 && (
        <div style={{ marginBottom: ".8rem" }}>
          <span className={styles.sectionKicker} style={{ display: "block", marginBottom: ".4rem" }}>
            Quick Actions
          </span>
          <QuickActions actions={quickActions} />
        </div>
      )}

      {/* 3 — Needs attention (Head Coach only) */}
      {isHeadCoachViewer && <RequestsEntryCard slug={slug} count={pendingRequestCount} />}

      {/* 4 — Upcoming Events */}
      {next3.length > 0 && (
        <div className="elf-section-flat" style={{ padding: ".2rem 0 .5rem", marginBottom: ".8rem" }}>
          <h2 className={styles.sectionKicker} style={{ display: "block", marginBottom: ".2rem" }}>
            Upcoming
          </h2>
          {next3.map((ev, i) => (
            <div key={ev.id} style={i === next3.length - 1 ? { borderBottom: "none" } : {}}>
              <UpcomingEventRow ev={ev} onOpen={setViewingEvent} />
            </div>
          ))}
        </div>
      )}

      {/* 2 — Team Communications */}
      <div style={{ marginBottom: ".5rem" }}>
        <span className={styles.sectionKicker} style={{ display: "block", marginBottom: ".1rem" }}>
          Updates
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team Communications
          </h2>
          {unread > 0 && (
            <span className="elf-badge" style={{ background: "var(--color-error)", color: "#fff" }}>
              {unread} new
            </span>
          )}
          <div style={{ flex: 1 }} />
          <CoachBar show={canEdit} label="Post" onAdd={openAdd} />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="elf-empty-state" style={{ marginBottom: ".8rem" }}>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-secondary-app)" }}>
            No announcements yet
          </div>
          <div style={{ fontSize: ".8rem", color: "var(--text-muted-app)" }}>
            {canEdit ? "Use the Post button to get started." : "Check back soon."}
          </div>
        </div>
      ) : (
        <>
          {preview.map(a => (
            <AnnouncementCard key={a.id} a={a} canEdit={canEdit} canDelete={canDelete} onEdit={openEdit} onDelete={handleDelete} />
          ))}
          <a
            href={`/team/${slug}/communications?tab=updates`}
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
        </>
      )}

      {/* 3 — Sponsors */}
      {sponsors.length > 0 && (
        <div style={{ marginTop: ".25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".5rem" }}>
            <span className={styles.sectionKicker}>
              Our Sponsors
            </span>
            <a
              href={`/team/${slug}/sponsors`}
              className={`${styles.sectionLink} elf-focus-ring`}
            >
              View All →
            </a>
          </div>
          <div style={{ display: "flex", gap: ".5rem", overflowX: "auto", paddingBottom: ".25rem", scrollbarWidth: "none" } as React.CSSProperties}>
            {sponsors.slice(0, 5).map(s => (
              <a
                key={s.id}
                href={s.url || `/team/${slug}/sponsors`}
                target={s.url ? "_blank" : undefined}
                rel={s.url ? "noopener noreferrer" : undefined}
                className="elf-focus-ring"
                style={{
                  flexShrink: 0,
                  width: 80,
                  background: "var(--surface-light)",
                  border: "1px solid var(--border-app)",
                  borderRadius: 12,
                  padding: ".6rem .4rem .5rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: ".3rem",
                  textDecoration: "none",
                }}
              >
                {s.logo_url ? (
                  <img
                    src={s.logo_url}
                    alt={s.name}
                    style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6 }}
                  />
                ) : (
                  <div style={{
                    width: 44, height: 44, borderRadius: 6,
                    background: "var(--surface-light-elevated)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: ".9rem", color: "var(--team-primary)",
                  }}>
                    {s.name.trim()[0]?.toUpperCase() ?? "S"}
                  </div>
                )}
                <span style={{
                  fontSize: ".58rem", fontWeight: 700, color: "var(--text-secondary-app)",
                  textAlign: "center", lineHeight: 1.25,
                  overflow: "hidden", display: "-webkit-box",
                  WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                }}>
                  {s.name}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Event details — same shared component the Calendar page uses, so
          Home can never show different information than Calendar for the
          same event. Home doesn't own event-mutation state, so this is
          always view-only here regardless of role; full management stays
          on the Calendar page. */}
      {viewingEvent && (
        <EventDetailsModal
          ev={viewingEvent}
          canManage={false}
          onClose={() => setViewingEvent(null)}
        />
      )}

      {/* Announcement modal */}
      {modalOpen && (
        <Modal title={isEditing ? "Edit Announcement" : "New Announcement"} onClose={closeModal}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
            <label style={lbl}>
              Title *
              <input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Practice moved to Tuesday" autoFocus />
            </label>
            <label style={lbl}>
              Body
              <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Optional details…" />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
              <label style={lbl}>
                Category
                <select style={inp} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="team">Team</option>
                  <option value="schedule">Schedule</option>
                  <option value="fundraiser">Fundraiser</option>
                  <option value="travel">Travel</option>
                  <option value="meet-info">Meet Info</option>
                  <option value="team-alert">Team Alert</option>
                </select>
              </label>
              <label style={lbl}>
                Priority
                <select style={inp} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as AForm["priority"] }))}>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="pinned">Pinned</option>
                </select>
              </label>
            </div>
            {error && (
              <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "var(--color-error)", fontSize: ".82rem" }}>
                {error}
              </p>
            )}
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", paddingTop: ".25rem" }}>
              <button onClick={closeModal} className="elf-btn elf-btn-ghost elf-focus-ring" style={{ padding: ".5rem 1rem", fontSize: ".85rem" }}>
                Cancel
              </button>
              <button onClick={isEditing ? handleEdit : handleAdd} disabled={saving} className="elf-btn elf-btn-primary elf-focus-ring" style={{ padding: ".5rem 1rem", fontSize: ".85rem", opacity: saving ? .7 : 1, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "Saving…" : isEditing ? "Save Changes" : "Post"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
