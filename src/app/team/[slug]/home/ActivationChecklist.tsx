"use client";

import { isStaff, isHeadCoach, isCoachOnly, type TeamActor } from "@/lib/permissions";

// ── Style tokens (mirrors the tag styling already used for announcement
//    category/priority badges elsewhere on Home) ───────────────────────────────

const TAG = {
  required:    { label: "Required",    bg: "#fee2e2", color: "#dc2626" },
  recommended: { label: "Recommended", bg: "#fef3c7", color: "#b45309" },
  optional:    { label: "Optional",    bg: "#f3f4f6", color: "#6b7280" },
  review:      { label: "Needs Review", bg: "#fef3c7", color: "#b45309" },
} as const;

function fmtMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// ── One actionable row ──────────────────────────────────────────────────────

function ChecklistRow({
  icon,
  title,
  subtitle,
  tag,
  done,
  href,
  external,
}: {
  icon: string;
  title: string;
  subtitle: string;
  tag?: (typeof TAG)[keyof typeof TAG];
  done: boolean;
  href: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      style={{
        display: "flex", alignItems: "center", gap: ".65rem",
        padding: ".55rem .1rem", textDecoration: "none",
        borderBottom: "1px solid #f3f4f6",
      }}
    >
      <div style={{
        width: 27, height: 27, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: done ? ".85rem" : ".9rem", fontWeight: 800,
        background: done ? "#dcfce7" : "#f3f4f6",
        color: done ? "#16a34a" : "#9ca3af",
      }}>
        {done ? "✓" : icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: ".84rem", fontWeight: 700, color: "#0b1e3d" }}>{title}</span>
          {tag && (
            <span style={{
              fontSize: ".52rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em",
              padding: ".08rem .34rem", borderRadius: 100, background: tag.bg, color: tag.color, flexShrink: 0,
            }}>
              {tag.label}
            </span>
          )}
        </div>
        <div style={{ fontSize: ".72rem", color: "#6b7280", marginTop: ".08rem", lineHeight: 1.35 }}>{subtitle}</div>
      </div>
      <span style={{ fontSize: ".85rem", color: "#c1c7d0", flexShrink: 0 }}>→</span>
    </a>
  );
}

// ── Informational-only row (no CTA — nothing to click) ──────────────────────

function InfoRow({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".55rem .1rem" }}>
      <div style={{
        width: 27, height: 27, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: ".9rem", background: "#f3f4f6", color: "#9ca3af",
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: ".84rem", fontWeight: 700, color: "#0b1e3d" }}>{title}</span>
        <div style={{ fontSize: ".72rem", color: "#6b7280", marginTop: ".08rem" }}>{subtitle}</div>
      </div>
      <span style={{ fontSize: ".62rem", color: "#c1c7d0", flexShrink: 0, whiteSpace: "nowrap" }}>Set by admin</span>
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────
//
// "Fundraiser Setup" / "Get Your Team Ready" — Phase 3A-1. Every item's
// done/shown state is derived live from real ELF data already fetched by
// home/page.tsx (no manual checkboxes, nothing stored). Item visibility is
// scoped to what each role can actually act on (isStaff/isHeadCoach/
// isCoachOnly — the SAME existing permission predicates used everywhere
// else in the Team App, not a new authorization concept), so no role is
// ever shown a CTA it doesn't have access to complete. This slice is
// read-only with respect to launch/visibility — there is no "Launch"
// action here and no campaign-state field is read or written.
export default function ActivationChecklist({
  slug,
  actor,
  athleteCount,
  staffCount,
  pendingRequestCount,
  sponsorCount,
  goalCents,
}: {
  slug: string;
  actor: TeamActor;
  athleteCount: number;
  staffCount: number;
  pendingRequestCount: number;
  sponsorCount: number;
  goalCents: number;
}) {
  if (!isStaff(actor)) return null;

  const headCoach = isHeadCoach(actor);
  const coachOnly = isCoachOnly(actor);

  const athletesDone = athleteCount > 0;
  const requiredDone = [athletesDone].filter(Boolean).length;
  const requiredTotal = 1;
  const allRequiredDone = requiredDone === requiredTotal;

  const staffDone = staffCount > 1;
  const sponsorsDone = sponsorCount > 0;

  return (
    <div style={{
      background: "#fff",
      borderRadius: 14,
      padding: ".9rem 1rem .3rem",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      marginBottom: ".8rem",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: ".5rem", marginBottom: ".15rem" }}>
        <div>
          <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
            Fundraiser Setup
          </span>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Get Your Team Ready
          </h2>
        </div>
        <span style={{
          flexShrink: 0, marginTop: ".15rem",
          padding: ".22rem .55rem", borderRadius: 100, fontSize: ".65rem", fontWeight: 700, whiteSpace: "nowrap",
          background: allRequiredDone ? "#dcfce7" : "#fef3c7",
          color:      allRequiredDone ? "#16a34a" : "#b45309",
        }}>
          {allRequiredDone
            ? "✓ Ready"
            : `${requiredTotal - requiredDone} step${requiredTotal - requiredDone !== 1 ? "s" : ""} needed`}
        </span>
      </div>

      <div>
        <ChecklistRow
          icon="👥"
          title="Add athletes"
          subtitle={athletesDone
            ? `${athleteCount} athlete${athleteCount !== 1 ? "s" : ""} on the roster.`
            : "No athletes yet — add your first athlete to get started."}
          tag={TAG.required}
          done={athletesDone}
          href={`/team/${slug}/team`}
        />

        {headCoach && (
          <ChecklistRow
            icon="🧑‍🤝‍🧑"
            title="Invite your staff"
            subtitle={staffDone
              ? `${staffCount} staff members on your team.`
              : "Just you so far — invite an assistant coach or booster."}
            tag={TAG.recommended}
            done={staffDone}
            href={`/team/${slug}/staff`}
          />
        )}

        {headCoach && pendingRequestCount > 0 && (
          <ChecklistRow
            icon="🔔"
            title="Pending athlete requests"
            subtitle={`${pendingRequestCount} athlete${pendingRequestCount !== 1 ? "s" : ""} waiting for your approval.`}
            tag={TAG.review}
            done={false}
            href={`/team/${slug}/team`}
          />
        )}

        <ChecklistRow
          icon="👀"
          title="Preview your fundraiser"
          subtitle="See exactly what your donors will see."
          done={false}
          href={`/campaign/${slug}`}
          external
        />

        {coachOnly && (
          <ChecklistRow
            icon="🤝"
            title="Add sponsors"
            subtitle={sponsorsDone
              ? `${sponsorCount} sponsor${sponsorCount !== 1 ? "s" : ""} added.`
              : "No sponsors yet — showcase your supporters."}
            tag={TAG.optional}
            done={sponsorsDone}
            href={`/team/${slug}/sponsors`}
          />
        )}

        <InfoRow
          icon="🎯"
          title="Fundraising goal"
          subtitle={goalCents > 0 ? `${fmtMoney(goalCents)} team goal` : "No goal set yet."}
        />
      </div>
    </div>
  );
}
