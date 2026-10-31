"use client";

import type { TeamAthleteRow } from "@/lib/teamData";
import { isHeadCoach, isStaff, type TeamActor } from "@/lib/permissions";
import { canViewAthleteAttendance } from "@/lib/athleteAttendance";
import type { AthleteRosterState } from "@/app/team/[slug]/team/useAthleteRoster";
import { takeAttendanceHref } from "@/app/team/[slug]/team/takeAttendance";
import AthleteAttendanceCard from "@/app/team/[slug]/team/[id]/AthleteAttendanceCard";
import TeamTabs from "./DemoTeamTabs";
import RosterTabs from "./DemoRosterTabs";
import AthleteRosterGrid from "./DemoAthleteRosterGrid";
import NextPhaseScreen from "./NextPhase";
import { DEMO_ROSTER, DEMO_SLUG, DEMO_TEAM, JORDAN_ELLIS_ID } from "./demoData";
import { demoAthleteAttendance, type DemoAttendanceDb } from "./attendanceData";

// The Team tab — Overview / Roster / To-Do List — and the member view of an
// athlete's profile, as far as Phase 3 of the demo goes:
//
//   generated twins  TeamTabs, RosterTabs, AthleteRosterGrid and
//                    TakeAttendanceLink (real files, only router/link
//                    imports swapped — see generate-team-app-demo-twins.mjs)
//   reused as-is     AthleteAttendanceCard, takeAttendanceHref,
//                    canViewAthleteAttendance, the roster helpers
//   later phases     Overview, To-Do List, Staff, the coach's athlete
//                    profile and the rest of the member profile
//
// Roles follow the app: staff see Take Attendance (coaches only, via
// takeAttendanceHref → canViewAttendance), Add Athlete and edit controls; an
// athlete sees "My Profile" and a parent "My Athletes" pinned above the
// roster, and can open only that profile.

type Notify = (message?: string) => void;

const GRAD_YEAR: Record<string, number> = { Senior: 2027, Junior: 2028, Sophomore: 2029, Freshman: 2030 };

export const DEMO_TEAM_ATHLETES: TeamAthleteRow[] = DEMO_ROSTER.map(a => ({
  id: a.id,
  campaign_slug: DEMO_SLUG,
  name: a.name,
  event: a.position,
  class_year: a.classYear,
  created_at: "2026-08-01T15:00:00.000Z",
  contact_phone: null,
  contact_email: null,
  jersey_number: Number(a.jersey),
  grad_year: GRAD_YEAR[a.classYear] ?? null,
  profile_photo: null,
  goal_cents: null,
}));

/** Athletes a parent is linked to (team/page.tsx's getLinkedAthleteIdsForMember). */
export function demoLinkedAthleteIds(actor: TeamActor): string[] {
  return actor.kind === "member" && actor.session.role === "parent" ? [JORDAN_ELLIS_ID] : [];
}

export default function DemoTeam({ actor, notify }: { actor: TeamActor; notify: Notify }) {
  const staffMode = isStaff(actor);
  const previewOnly = () => notify("Preview only — editing the roster isn't part of this demo.");
  const roster = {
    staffMode, canEdit: staffMode, canDelete: isHeadCoach(actor), seasonReadOnly: false,
    athletes: DEMO_TEAM_ATHLETES,
    openAdd: previewOnly, openEdit: previewOnly, handleDelete: async () => previewOnly(),
  } as unknown as AthleteRosterState;

  return (
    <TeamTabs
      actor={actor}
      overview={<NextPhaseScreen title="Team Overview" />}
      roster={
        <RosterTabs
          actor={actor}
          athletes={
            <AthleteRosterGrid
              slug={DEMO_SLUG}
              roster={roster}
              actor={actor}
              pendingRequestCount={0}
              linkedAthleteIds={demoLinkedAthleteIds(actor)}
              attendanceHref={takeAttendanceHref(DEMO_SLUG, actor)}
            />
          }
          staff={<NextPhaseScreen title="Staff" />}
        />
      }
      clearance={<NextPhaseScreen title="To-Do List" />}
    />
  );
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

function avatarColor(name: string): string {
  const palette = ["#0b2044", "#92400e", "#1e3a8a", "#5b21b6", "#065f46", "#9f1239", "#1e4d7b", "#78350f"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[hash % palette.length];
}

/** The member view of an athlete's profile (athlete/[id]): the real hero
 *  card (twin of AthleteProfileView's) and the real Attendance card, shown
 *  only to the athlete and a linked parent — the rest of the profile
 *  arrives in a later phase. */
export function DemoMemberAthleteProfile({ actor, athleteId, attendanceDb }: { actor: TeamActor; athleteId: string; attendanceDb: DemoAttendanceDb }) {
  const athlete = DEMO_TEAM_ATHLETES.find(a => a.id === athleteId);
  if (!athlete) return <NextPhaseScreen title="Athlete profile" />;
  const bg = avatarColor(athlete.name);
  const primary = DEMO_TEAM.primaryColor;
  const attendance = canViewAthleteAttendance(actor, athleteId, demoLinkedAthleteIds(actor))
    ? demoAthleteAttendance(attendanceDb, athleteId)
    : null;

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <a
        href={`/team/${DEMO_SLUG}/team`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: ".3rem",
          fontSize: ".8rem",
          fontWeight: 600,
          color: "#6b7280",
          textDecoration: "none",
          marginBottom: ".875rem",
        }}
      >
        ← Team
      </a>

      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: "1.5rem 1rem 1.25rem",
        textAlign: "center",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        borderTop: `4px solid ${primary}`,
        marginBottom: ".65rem",
      }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: ".75rem" }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%", background: bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: "1.5rem", color: "#fff",
            boxShadow: "0 2px 12px rgba(0,0,0,.18)",
          }}>
            {initials(athlete.name)}
          </div>
        </div>

        <div style={{ fontWeight: 800, fontSize: "1.3rem", color: "#0b1e3d", lineHeight: 1.15, marginBottom: ".45rem" }}>
          {athlete.name}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: ".35rem", flexWrap: "wrap" }}>
          {(athlete.class_year || athlete.event) && (
            <span style={{
              display: "inline-block", padding: ".18rem .55rem", borderRadius: 100,
              fontSize: ".65rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: ".04em", background: "#f0f4ff", color: "#1d4ed8",
            }}>
              {athlete.class_year || athlete.event}
            </span>
          )}
          {athlete.class_year && athlete.event && (
            <span style={{
              display: "inline-block", padding: ".18rem .55rem", borderRadius: 100,
              fontSize: ".65rem", fontWeight: 700,
              background: "#f3f4f6", color: "#6b7280",
            }}>
              {athlete.event}
            </span>
          )}
          {athlete.grad_year != null && (
            <span style={{
              display: "inline-block", padding: ".18rem .55rem", borderRadius: 100,
              fontSize: ".65rem", fontWeight: 700,
              background: "#f3f4f6", color: "#6b7280",
            }}>
              Class of &apos;{String(athlete.grad_year).slice(-2)}
            </span>
          )}
          {athlete.jersey_number != null && (
            <span style={{
              display: "inline-block", padding: ".18rem .55rem", borderRadius: 100,
              fontSize: ".65rem", fontWeight: 700,
              background: "#0b1e3d", color: "#fff",
            }}>
              #{athlete.jersey_number}
            </span>
          )}
        </div>
      </div>

      {attendance && <AthleteAttendanceCard attendance={attendance} />}

      <NextPhaseScreen title="More of the athlete profile" />
    </div>
  );
}
