// Team Management Phase 3 — task acknowledgments: pure rules (statement,
// name validation, building what an athlete or parent sees). Import-free
// apart from types, so client components and Node's test runner can load
// it directly. Database access lives in src/lib/teamTaskAcksStore.ts; the
// database itself (phase_t3_task_acknowledgments.sql) is the authority on
// who may acknowledge and what counts.

/** Must match team_task_ack_statement(1) in the database. The database
 *  stores its own copy of the text; this one is only for display. */
export const ACK_STATEMENT_VERSION = 1;
export const ACK_STATEMENT =
  "I acknowledge that I have reviewed and understand the information, instructions, links, and documents associated with this task.";

export type AckRequirement = "athlete" | "parent";

export const ACK_NAME_MIN = 2;
export const ACK_NAME_MAX = 120;

/** The typed full name, normalized exactly as the database does (trimmed,
 *  inner whitespace collapsed), or null if it isn't acceptable. */
export function normalizeAckName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < ACK_NAME_MIN || name.length > ACK_NAME_MAX) return null;
  if (/[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

/** Which acknowledgments a task's audience requires for each athlete. */
export function requirementsFor(audience: string): AckRequirement[] {
  if (audience === "both") return ["athlete", "parent"];
  if (audience === "athlete") return ["athlete"];
  if (audience === "parent") return ["parent"];
  return [];
}

/** Who may acknowledge, derived on the server from the signed session:
 *  their own team_members row, the account it belongs to, the role they
 *  acknowledge in, and the athletes they are currently linked to. */
export type AckIdentity = {
  memberId: string;
  accountId: string | null;
  memberName: string | null;
  requirement: AckRequirement;
  athleteIds: string[];
};

/** One row of team_task_ack_status(). Includes names — never sent to the
 *  browser as-is; see buildAckView(). */
export type AckStatusRow = {
  task_id: string;
  task_revision: number;
  athlete_id: string;
  requirement: AckRequirement;
  satisfied: boolean;
  acknowledgment_id: string | null;
  acknowledged_by_member_id: string | null;
  acknowledged_full_name: string | null;
  acknowledged_member_name: string | null;
  acknowledged_at: string | null;
  has_eligible_member: boolean;
  earlier_revision_acknowledged: boolean;
};

/** One requirement for one child, as the family sees it. Deliberately has
 *  no names: another person's typed name is never shown to a family. */
export type AckEntry = {
  requirement: AckRequirement;
  satisfied: boolean;
  by: "you" | "athlete" | "parent" | null;
  at: string | null;
  earlierRevision: boolean;  // acknowledged before the task last changed
  noEligibleMember: boolean; // nobody (yet) who could acknowledge it
};

export type AckChild = { athleteId: string; name: string; entries: AckEntry[] };

export type AckView = {
  requirement: AckRequirement;
  revision: number;
  statement: { version: number; text: string };
  children: AckChild[];
  /** Athletes the viewer's acknowledgment would cover right now. */
  outstandingAthleteIds: string[];
};

/** What an athlete/parent (or coach-parent) sees for one task, or null if
 *  the task doesn't ask anything of them. */
export function buildAckView(
  task: { id: string; revision: number; audience: string },
  identity: AckIdentity,
  rows: readonly AckStatusRow[],
  athleteNames: ReadonlyMap<string, string>,
): AckView | null {
  const required = requirementsFor(task.audience);
  if (!required.includes(identity.requirement)) return null;

  const linked = new Set(identity.athleteIds);
  const mine = rows.filter(r => r.task_id === task.id && linked.has(r.athlete_id) && required.includes(r.requirement));
  const childIds = [...new Set(mine.map(r => r.athlete_id))];

  const children: AckChild[] = childIds.map(athleteId => ({
    athleteId,
    name: athleteNames.get(athleteId) ?? "Athlete",
    entries: required.map((requirement): AckEntry => {
      const r = mine.find(x => x.athlete_id === athleteId && x.requirement === requirement);
      const satisfied = !!r?.satisfied;
      return {
        requirement,
        satisfied,
        by: !satisfied ? null : r!.acknowledged_by_member_id === identity.memberId ? "you" : requirement,
        at: satisfied ? r!.acknowledged_at : null,
        earlierRevision: !satisfied && !!r?.earlier_revision_acknowledged,
        noEligibleMember: !satisfied && !!r && !r.has_eligible_member,
      };
    }),
  })).sort((a, b) => a.name.localeCompare(b.name));

  const outstandingAthleteIds = children
    .filter(c => !c.entries.find(e => e.requirement === identity.requirement)?.satisfied)
    .map(c => c.athleteId);

  return {
    requirement: identity.requirement,
    revision: task.revision,
    statement: { version: ACK_STATEMENT_VERSION, text: ACK_STATEMENT },
    children,
    outstandingAthleteIds,
  };
}

/** Row icon in the task list: does this task still need the viewer? */
export function ackRowStatus(view: AckView | null): "done" | "todo" | null {
  if (!view || view.children.length === 0) return null;
  return view.outstandingAthleteIds.length > 0 ? "todo" : "done";
}

/** True when the browser's list of covered athletes is exactly the set
 *  the server would cover now (order and duplicates ignored). */
export function sameAthleteSet(a: readonly string[], b: readonly string[]): boolean {
  const x = new Set(a), y = new Set(b);
  return x.size === y.size && [...x].every(id => y.has(id));
}
