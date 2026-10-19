// Phase 3C (family) — the To-Do Tasks card on the family athlete profile
// (/team/[slug]/athlete/[id]). The family API itself is tested in
// api/team/[slug]/todo/completion/completion.route.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { TeamActor } from "../../../../../lib/permissions.ts";
import { taskViewerFor } from "../../../../../lib/teamTasks.ts";
import {
  familyAthleteCompletion,
  profileCompletionSource,
  type AthleteTaskCompletion,
  type CompletionEntry,
} from "../../../../../lib/teamTaskCompletion.ts";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const page = src("./page.tsx");
const view = src("./AthleteProfileView.tsx");
const card = src("../../team/[id]/AthleteTaskCompletion.tsx");
const staffPage = src("../../team/[id]/page.tsx");

const coach = (role: string): TeamActor => ({ kind: "coach", session: { id: "c", name: "C", role, campaign_slug: "s" } as never });
const member = (role: string): TeamActor => ({ kind: "member", session: { id: "m", name: "M", role, campaign_slug: "s", athlete_id: "a1", account_id: null } as never });
const admin: TeamActor = { kind: "platform_admin", session: { platformAdminId: "p", accountId: "a", name: "A", email: "e", campaign_slug: "s" } };
const source = (a: TeamActor) => profileCompletionSource(a.kind, taskViewerFor(a));

test("which card: athlete/parent -> family; Head/Assistant Coach/platform admin -> coach; boosters none", () => {
  assert.equal(source(member("athlete")), "family");
  assert.equal(source(member("parent")), "family");
  assert.equal(source(coach("head_coach")), "coach");
  assert.equal(source(coach("assistant_coach")), "coach"); // a coach-parent resolves as a coach
  assert.equal(source(admin), "coach");
  assert.equal(source(coach("booster")), null);
  assert.equal(source(member("booster")), null);
  assert.equal(source({ kind: "public" }), null);
});

test("page: access rules unchanged; the card choice is made on the server", () => {
  assert.match(page, /const actor = await requireTeamMembership\(slug\);\s*if \(!\(await canAccessAthleteProfile\(actor, id\)\)\) notFound\(\);/);
  assert.match(page, /if \(!athlete \|\| athlete\.campaign_slug !== slug\) notFound\(\);/);
  assert.match(page, /const taskCompletion = profileCompletionSource\(actor\.kind, taskViewerFor\(actor\)\);/);
  assert.match(page, /taskCompletion=\{taskCompletion\}/);
  // The staff profile still sends athletes/parents here (no staff sections exposed).
  assert.match(staffPage, /if \(!isStaff\(actor\)\) redirect\(`\/team\/\$\{slug\}\/athlete\/\$\{id\}`\);/);
  assert.match(staffPage, /showTaskCompletion=\{canViewCompletion\(taskViewerFor\(actor\)\)\}/);
});

test("placement: after the hero card, before (and outside) the fundraising sections; no staff sections", () => {
  const hero = view.indexOf("{/* ── Hero card ── */}");
  const todo = view.indexOf("{taskCompletion && <AthleteTaskCompletion slug={slug} athleteId={athleteId} source={taskCompletion} />}");
  const fundraising = view.indexOf("{fundraisingActive && (");
  assert.ok(hero > 0 && todo > hero && fundraising > todo, `${hero} < ${todo} < ${fundraising}`);
  // The family view never pulls in the staff profile or its sections.
  assert.doesNotMatch(view, /CoachAthleteView|ContactsSection|OutreachSection|Linked Members|contacts\/coach|\/outreach\//);
});

test("card: family source reads the family API and links to the To-Do List; coach source unchanged", () => {
  assert.match(card, /source === "family"\s*\? `\/api\/team\/\$\{slug\}\/todo\/family-completion\/\$\{id\}`\s*: `\/api\/team\/\$\{slug\}\/todo\/completion\/athletes\/\$\{id\}`/);
  assert.match(card, /source = "coach"/); // default: the staff profile's coach card is unchanged
  assert.match(card, /\{source === "family" && \(\s*<a\s*href=\{`\/team\/\$\{slug\}\/team\?tab=todo`\}[\s\S]*?Open To-Do List/);
  assert.match(card, /minHeight: 44/);
});

const entry = (requirement: "athlete" | "parent", state: CompletionEntry["state"]): CompletionEntry => ({ requirement, state, acknowledgedAt: null });
const task = (id: string, audience: string, entries: CompletionEntry[]): AthleteTaskCompletion =>
  ({ task: { id, title: id, audience, revision: 1 }, entries, status: "outstanding" });

test("family view keeps only tasks the viewer can see in their To-Do List, with all their requirements", () => {
  const all = {
    athlete: { id: "a1", name: "Ava", class_year: null, jersey_number: null },
    tasks: [
      task("both", "both", [entry("athlete", "complete"), entry("parent", "no_parent_linked")]),
      task("athlete", "athlete", [entry("athlete", "outstanding")]),
      task("parent", "parent", [entry("parent", "needs_update")]),
    ],
  };
  const forAthlete = familyAthleteCompletion(all, ["athlete", "both"]);
  assert.deepEqual(forAthlete.tasks.map(t => t.task.id), ["both", "athlete"]);
  assert.deepEqual(forAthlete.tasks[0].entries.map(e => e.requirement), ["athlete", "parent"]);
  assert.deepEqual(forAthlete.totals, { required: 3, complete: 1, outstanding: 2, notAcknowledged: 1, needsUpdate: 0, cannotCompleteYet: 1, unknown: 0 });
  const forParent = familyAthleteCompletion(all, ["parent", "both"]);
  assert.deepEqual(forParent.tasks.map(t => t.task.id), ["both", "parent"]);
  assert.equal(forParent.totals.needsUpdate, 1);
  assert.deepEqual(familyAthleteCompletion(all, []).tasks, []);
});
