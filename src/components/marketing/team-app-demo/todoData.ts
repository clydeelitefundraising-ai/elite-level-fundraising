// Fictional To-Do List records for the isolated Team App demo
// (/preview/team-app): the head coach's tasks for athletes and parents,
// who has acknowledged them, the team's documents and the Resources list.
// NOTHING here is a real form, document, person or record; links use the
// reserved .example domain and no document's contents are included.
//
// Who can acknowledge follows the demo's people (commsData.ts): only
// Jordan, Maya and Lucas have joined the team app as athletes, and only
// Jordan (Erin Ellis) and Maya (Ana Torres) have a linked parent — so the
// coach's completion view shows "not joined" / "no parent linked" for the
// rest of the roster, exactly as the app does for a team mid-adoption.

import type { TaskRow } from "@/lib/teamTasksStore";
import type { AckIdentity, AckRequirement, AckStatusRow } from "../../../lib/teamTaskAcks.ts";
import { requirementsFor } from "../../../lib/teamTaskAcks.ts";
import type { CompletionStatusRow } from "../../../lib/teamTaskCompletion.ts";
import type { TeamActor } from "@/lib/permissions";
import { DEMO_ROSTER, DEMO_SLUG, JORDAN_ELLIS_ID } from "./demoData.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export type DemoAttachment = { id: string; name: string; file_type: "pdf" | "image" | "doc"; size_bytes: number };

export type DemoTask = TaskRow;

export type DemoAck = {
  task_id: string;
  athlete_id: string;
  requirement: AckRequirement;
  revision: number;
  member_id: string;
  full_name: string;
  at: string;
};

export type DemoClearanceResource = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  attachment_id: string | null;
  attachment: DemoAttachment | null;
  sort_order: number;
  created_at: string;
};

const MAYA_ID = DEMO_ROSTER[0].id;
const LUCAS_ID = DEMO_ROSTER[8].id;

/** team_members rows with an ELF account (same people as commsData.ts). */
export const DEMO_FAMILY_MEMBERS = [
  { id: id(201), name: "Jordan Ellis", role: "athlete" as const, athlete_id: JORDAN_ELLIS_ID },
  { id: id(202), name: "Maya Torres", role: "athlete" as const, athlete_id: MAYA_ID },
  { id: id(203), name: "Lucas Bennett", role: "athlete" as const, athlete_id: LUCAS_ID },
  { id: id(301), name: "Erin Ellis", role: "parent" as const, athlete_id: JORDAN_ELLIS_ID },
  { id: id(302), name: "Ana Torres", role: "parent" as const, athlete_id: MAYA_ID },
];

/** The team's documents (team_files), shown by name and size only. */
export const DEMO_TEAM_FILES: DemoAttachment[] = [
  { id: id(7501), name: "Pre-Participation Physical Form.pdf", file_type: "pdf", size_bytes: 186_000 },
  { id: id(7502), name: "Comets Football Team Handbook 2026.pdf", file_type: "pdf", size_bytes: 942_000 },
  { id: id(7503), name: "Emergency Medical Information Form.pdf", file_type: "pdf", size_bytes: 121_000 },
  { id: id(7504), name: "Car Wash Volunteer Schedule.pdf", file_type: "pdf", size_bytes: 64_000 },
];
const [PHYSICAL, HANDBOOK, MEDICAL, CAR_WASH] = DEMO_TEAM_FILES;

type TaskSeed = Pick<DemoTask, "title" | "instructions" | "body_text" | "audience" | "status" | "revision"> & {
  daysAgo: number;
  resources: ({ kind: "file"; file: DemoAttachment; label?: string } | { kind: "link"; url: string; label: string })[];
};

const TASKS: TaskSeed[] = [
  {
    title: "Turn in your physical form",
    audience: "both",
    status: "active",
    revision: 1,
    daysAgo: 40,
    instructions: "Print the form, have your doctor complete and sign it, and turn it in to Coach Whitfield before your first practice. Athletes can't practice without a current physical on file.",
    body_text: null,
    resources: [{ kind: "file", file: PHYSICAL }],
  },
  {
    title: "Read and sign the Team Code of Conduct",
    audience: "both",
    status: "active",
    revision: 2,
    daysAgo: 38,
    instructions: "Read the team handbook with your family, then acknowledge below.",
    body_text: "Updated this week: the handbook now includes the away-game travel policy (page 6) and the new practice attendance expectations (page 9).",
    resources: [{ kind: "file", file: HANDBOOK }],
  },
  {
    title: "Watch the concussion awareness video",
    audience: "athlete",
    status: "active",
    revision: 1,
    daysAgo: 35,
    instructions: "Watch the 12-minute video, then acknowledge below. Talk to a coach if you have any questions about symptoms or return-to-play.",
    body_text: null,
    resources: [{ kind: "link", url: "https://training.sunridge-comets.example/concussion-awareness", label: "Concussion awareness video" }],
  },
  {
    title: "Update emergency contact and medical information",
    audience: "parent",
    status: "active",
    revision: 1,
    daysAgo: 21,
    instructions: "Fill out the form with current emergency contacts, allergies and medications, and send it back with your athlete.",
    body_text: null,
    resources: [{ kind: "file", file: MEDICAL }],
  },
  {
    title: "Sign up to volunteer at the Team Car Wash",
    audience: "parent",
    status: "active",
    revision: 1,
    daysAgo: 6,
    instructions: "We need two parents per shift on Saturday morning. Check the schedule and reply to Coach Whitfield with the shift you can cover.",
    body_text: null,
    resources: [{ kind: "file", file: CAR_WASH }],
  },
  {
    title: "Summer conditioning waiver",
    audience: "both",
    status: "archived",
    revision: 1,
    daysAgo: 120,
    instructions: "Required for the June conditioning program.",
    body_text: null,
    resources: [],
  },
];

export function buildDemoTasks(now: Date): DemoTask[] {
  return TASKS.map((t, i): DemoTask => {
    const at = new Date(now.getTime() - t.daysAgo * 86_400_000).toISOString();
    const revisedAt = t.revision > 1 ? new Date(now.getTime() - 3 * 86_400_000).toISOString() : at;
    return {
      id: id(7001 + i),
      campaign_slug: DEMO_SLUG,
      title: t.title,
      instructions: t.instructions,
      body_text: t.body_text,
      audience: t.audience,
      status: t.status,
      sort_order: i + 1,
      revision: t.revision,
      revised_at: revisedAt,
      version: t.revision,
      created_by_name: "Dana Whitfield",
      updated_by_name: "Dana Whitfield",
      created_at: at,
      updated_at: revisedAt,
      archived_at: t.status === "archived" ? new Date(now.getTime() - 60 * 86_400_000).toISOString() : null,
      resources: t.resources.map((r, k) => ({
        id: id(7101 + i * 10 + k),
        kind: r.kind,
        url: r.kind === "link" ? r.url : null,
        attachment_id: r.kind === "file" ? r.file.id : null,
        label: r.kind === "link" ? r.label : r.label ?? null,
        sort_order: k,
        attachment: r.kind === "file" ? r.file : null,
      })),
    } as DemoTask;
  });
}

/** Acknowledgments on file. Task 2 was revised after Ana Torres
 *  acknowledged it, so hers is for an earlier revision ("needs update"). */
export function buildDemoAcks(now: Date, tasks: DemoTask[]): DemoAck[] {
  const [physical, conduct, concussion, medical, carWash] = tasks;
  const at = (days: number, hours = 0) => new Date(now.getTime() - days * 86_400_000 - hours * 3_600_000).toISOString();
  const member = (memberId: string) => DEMO_FAMILY_MEMBERS.find(m => m.id === memberId)!;
  const ack = (task: DemoTask, athleteId: string, requirement: AckRequirement, memberId: string, when: string, revision = task.revision): DemoAck =>
    ({ task_id: task.id, athlete_id: athleteId, requirement, revision, member_id: memberId, full_name: member(memberId).name, at: when });
  const [jordan, maya, lucas, erin, ana] = DEMO_FAMILY_MEMBERS.map(m => m.id);
  return [
    ack(physical, JORDAN_ELLIS_ID, "athlete", jordan, at(30, 2)),
    ack(physical, JORDAN_ELLIS_ID, "parent", erin, at(30, 1)),
    ack(physical, MAYA_ID, "athlete", maya, at(28, 5)),
    ack(physical, MAYA_ID, "parent", ana, at(27, 3)),
    ack(conduct, JORDAN_ELLIS_ID, "parent", erin, at(2, 4)),
    ack(conduct, MAYA_ID, "athlete", maya, at(2, 6)),
    ack(conduct, MAYA_ID, "parent", ana, at(20, 2), 1),
    ack(conduct, LUCAS_ID, "athlete", lucas, at(1, 3)),
    ack(concussion, JORDAN_ELLIS_ID, "athlete", jordan, at(25, 1)),
    ack(concussion, LUCAS_ID, "athlete", lucas, at(24, 7)),
    ack(medical, MAYA_ID, "parent", ana, at(15, 2)),
    ack(carWash, MAYA_ID, "parent", ana, at(1, 1)),
  ];
}

/** The team's Resources list (Clearance). */
export function buildDemoResources(now: Date): DemoClearanceResource[] {
  const at = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  return [
    { id: id(7601), title: "Register My Athlete", description: "Online athletic registration for the 2026 season.", url: "https://register.sunridge-comets.example/football", attachment_id: null, attachment: null, sort_order: 1, created_at: at(60) },
    { id: id(7602), title: "Pre-Participation Physical Form", description: "Print, have your doctor complete it, and turn it in to the coaches.", url: null, attachment_id: PHYSICAL.id, attachment: PHYSICAL, sort_order: 2, created_at: at(58) },
    { id: id(7603), title: "Team Handbook", description: "Code of conduct, travel policy and practice expectations.", url: null, attachment_id: HANDBOOK.id, attachment: HANDBOOK, sort_order: 3, created_at: at(57) },
    { id: id(7604), title: "Game Day Parking Map", description: null, url: "https://maps.sunridge-comets.example/stadium-parking", attachment_id: null, attachment: null, sort_order: 4, created_at: at(30) },
  ];
}

// ── Acknowledgment status (team_task_ack_status) ────────────────────────────

/** Members who could acknowledge for an athlete in a role. */
export function eligibleMembers(athleteId: string, requirement: AckRequirement) {
  return DEMO_FAMILY_MEMBERS.filter(m => m.athlete_id === athleteId && m.role === requirement);
}

/** One status row per (task, athlete, required role) — what the database's
 *  team_task_ack_status() returns, computed from the demo's records. */
export function demoAckStatusRows(tasks: DemoTask[], athleteIds: readonly string[], acks: DemoAck[]): AckStatusRow[] {
  const rows: AckStatusRow[] = [];
  for (const task of tasks) {
    for (const athleteId of athleteIds) {
      for (const requirement of requirementsFor(task.audience)) {
        const mine = acks.filter(a => a.task_id === task.id && a.athlete_id === athleteId && a.requirement === requirement);
        const current = mine.filter(a => a.revision === task.revision).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
        const memberName = current ? DEMO_FAMILY_MEMBERS.find(m => m.id === current.member_id)?.name ?? null : null;
        rows.push({
          task_id: task.id,
          task_revision: task.revision,
          athlete_id: athleteId,
          requirement,
          satisfied: !!current,
          acknowledgment_id: current ? `${task.id}:${athleteId}:${requirement}` : null,
          acknowledged_by_member_id: current?.member_id ?? null,
          acknowledged_full_name: current?.full_name ?? null,
          acknowledged_member_name: memberName,
          acknowledged_at: current?.at ?? null,
          has_eligible_member: eligibleMembers(athleteId, requirement).length > 0,
          earlier_revision_acknowledged: !current && mine.some(a => a.revision < task.revision),
        });
      }
    }
  }
  return rows;
}

/** The coach-safe columns (COMPLETION_STATUS_COLUMNS) of the status rows. */
export function toCompletionRows(rows: AckStatusRow[]): CompletionStatusRow[] {
  return rows.map(r => ({
    task_id: r.task_id,
    task_revision: r.task_revision,
    athlete_id: r.athlete_id,
    requirement: r.requirement,
    satisfied: r.satisfied,
    acknowledged_at: r.acknowledged_at,
    has_eligible_member: r.has_eligible_member,
    earlier_revision_acknowledged: r.earlier_revision_acknowledged,
  }));
}

/** resolveAckIdentity for a demo actor: an athlete or parent member and the
 *  athletes they're linked to; null for coaches. */
export function demoAckIdentity(actor: TeamActor): AckIdentity | null {
  if (actor.kind !== "member") return null;
  const role = actor.session.role;
  if (role !== "athlete" && role !== "parent") return null;
  const member = DEMO_FAMILY_MEMBERS.find(m => m.id === actor.session.id);
  if (!member) return null;
  return {
    memberId: member.id,
    accountId: null,
    memberName: member.name,
    requirement: role,
    athleteIds: [member.athlete_id],
  };
}
