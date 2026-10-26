// Complete Season Phase 2 — every write route either refuses completed
// seasons (seasonWriteBlocked / seasonWriteBlockedFor before its first
// write) or is on the exemption list below with the reason it must keep
// working. A new write route fails this test until it makes that choice.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const API = join(process.cwd(), "src", "app", "api");

// "<route dir relative to src/app/api> <METHOD>" -> reason.
const EXEMPT: Record<string, string> = {
  // Team routes that must keep working on a completed season.
  "team/[slug]/account/delete POST": "privacy: account deletion must always work (purge uses the account_deletion purpose header)",
  "team/[slug]/announcements/[id]/seen POST": "personal read state, not season content",
  "team/[slug]/messages/threads/[threadId]/read POST": "personal read state (message_reads is not guarded)",
  "team/[slug]/notifications/read POST": "personal read state",
  "team/[slug]/notifications/[id] DELETE": "personal dismiss state",
  "team/[slug]/blocks POST": "safety: blocking must always work (user_blocks is not guarded)",
  "team/[slug]/blocks/[id] DELETE": "safety: unblocking",
  "team/[slug]/reports POST": "safety: reporting historical content must always work",
  "team/[slug]/reports/[id] PATCH": "safety: resolving a report",
  "team/[slug]/messages/[messageId]/moderate-remove POST": "moderation removal (moderation purpose header)",
  "team/[slug]/messages/attachments/[attachmentId]/moderate-remove POST": "moderation removal (moderation purpose header)",
  "team/[slug]/push/subscribe POST": "device registration, not season content",
  "team/[slug]/push/unsubscribe DELETE": "device unregistration",
  "team/[slug]/season/complete POST": "the transition itself: team_season_complete() refuses a completed season under its own row lock, and must still replay a just-completed transition's receipt",
  // Outside /team/[slug].
  "account/profile PATCH": "account-level profile",
  "account/profile/photo POST": "account-level profile photo",
  "account/profile/photo DELETE": "account-level profile photo",
  "account/team-order PUT": "account preference",
  "admin/athletes/import/parse POST": "parses an uploaded file; writes nothing",
  "admin/campaigns POST": "creates a new team",
  "admin/campaigns/duplicate POST": "creates a new team (only reads the source)",
  "admin/onboard POST": "creates a new team",
  "admin/demo/create POST": "creates a new demo team",
  "admin/demo/seed POST": "seeds the fixed demo team",
  "admin/logo-upload POST": "storage upload only",
  "team-onboarding/create POST": "creates a new team",
  "auth/staff-invite-accept POST": "guarded inside acceptStaffInvitation() (staffInvite.ts) once the invitation's team is known",
  "auth/login POST": "account sign-in",
  "auth/logout POST": "sign-out",
  "auth/request-reset POST": "account password reset",
  "auth/reset-password POST": "account password reset",
  "auth/signup POST": "account creation",
  "team/auth/login POST": "legacy coach sign-in (fixed separately: coachLoginMatch.ts)",
  "team/auth/logout POST": "sign-out",
  "checkout POST": "writes nothing; completed seasons are archived and checkout already refuses archived campaigns",
  "webhooks/stripe POST": "late Stripe donations must record against the completed season",
  "jobs/automation POST": "background job (automation events, not season content)",
  "jobs/notifications POST": "background job (notification delivery)",
  "marketing/demo-request POST": "marketing site",
  "platform-admin/community-partners POST": "platform-wide advertising, not a team",
  "platform-admin/community-partners/[id] PATCH": "platform-wide advertising, not a team",
  "platform-admin/community-partners/logo POST": "platform-wide advertising, not a team",
  "platform-admin/schools/[id]/advertising PATCH": "school-level setting, not a season",
  "platform-admin/fundraising-inquiries/[id] PATCH": "platform-admin follow-up (fundraising_inquiries is not guarded)",
  "platform-admin/messages/[messageId]/moderate-remove POST": "moderation removal (moderation purpose header)",
  "platform-admin/messages/attachments/[attachmentId]/moderate-remove POST": "moderation removal (moderation purpose header)",
  "platform-admin/reports/[id] PATCH": "safety: resolving a report",
  "push/devices POST": "device registration (account-level)",
  "push/devices/deactivate POST": "device unregistration",
  "push/preferences PATCH": "account notification preferences",
};
// Whole areas that never write a team's season data.
const EXEMPT_PREFIXES: Record<string, string> = {
  "admin/crm/": "internal sales CRM",
  "admin/marketing-requests": "marketing CRM",
  "admin/organization": "school-level settings and templates",
  "admin/sponsor-businesses": "internal sponsor CRM",
  "admin/automation/": "admin automation console",
  "admin/login": "admin sign-in",
  "admin/logout": "admin sign-out",
};

type Handler = { route: string; method: string; body: string };
function handlers(): Handler[] {
  const out: Handler[] = [];
  (function walk(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") {
        const route = relative(API, dir).split(sep).join("/");
        const src = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
        const re = /^export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b|^export const (GET|POST|PUT|PATCH|DELETE)\b/gm;
        const starts = [...src.matchAll(re)].map(m => ({ i: m.index!, method: m[1] ?? m[2] }));
        starts.forEach((s, k) => {
          if (s.method === "GET") return;
          out.push({ route, method: s.method, body: src.slice(s.i, k + 1 < starts.length ? starts[k + 1].i : src.length) });
        });
      }
    }
  })(API);
  return out;
}

const all = handlers();
const GUARD = /seasonWriteBlocked(For)?\(/;
const FIRST_WRITE = /method:\s*"(POST|PATCH|PUT|DELETE)"|\brest(Insert|Update|Delete)\(|\/rpc\//;

test("the inventory found the API's write handlers", () => {
  assert.ok(all.length > 120, `only ${all.length} write handlers found`);
  assert.ok(all.some(h => h.route === "team/[slug]/events" && h.method === "POST"));
});

test("every write handler either refuses completed seasons or is exempt with a reason", () => {
  const unaccounted = all.filter(h => {
    const key = `${h.route} ${h.method}`;
    if (EXEMPT[key]) return false;
    if (Object.keys(EXEMPT_PREFIXES).some(p => h.route.startsWith(p))) return false;
    return !GUARD.test(h.body);
  }).map(h => `${h.route} ${h.method}`);
  assert.deepEqual(unaccounted, [], "add seasonWriteBlocked(slug) or an EXEMPT entry with a reason");
});

test("every /team/[slug] write handler not exempted is guarded (78 handlers)", () => {
  const team = all.filter(h => h.route.startsWith("team/[slug]"));
  const guarded = team.filter(h => GUARD.test(h.body));
  const exempt = team.filter(h => EXEMPT[`${h.route} ${h.method}`]);
  assert.equal(guarded.length + exempt.length, team.length);
  assert.equal(guarded.length, 78);
  for (const h of exempt) assert.ok(!GUARD.test(h.body), `${h.route} ${h.method} is exempt but guarded`);
});

test("the guard runs before the handler's first direct database write", () => {
  const late = all.filter(h => GUARD.test(h.body)).filter(h => {
    const g = h.body.search(GUARD);
    const w = h.body.search(FIRST_WRITE);
    return w >= 0 && w < g;
  }).map(h => `${h.route} ${h.method}`);
  assert.deepEqual(late, []);
});

test("exempt entries are real handlers (no stale entries)", () => {
  const keys = new Set(all.map(h => `${h.route} ${h.method}`));
  assert.deepEqual(Object.keys(EXEMPT).filter(k => !keys.has(k)), []);
});

test("the guarded team routes cover every protected area", () => {
  const guardedRoutes = new Set(all.filter(h => GUARD.test(h.body)).map(h => h.route));
  for (const area of [
    "team/[slug]/roster", "team/[slug]/roster/[id]", "team/[slug]/events", "team/[slug]/events/[id]",
    "team/[slug]/announcements", "team/[slug]/announcements/[id]", "team/[slug]/announcements/[id]/comments",
    "team/[slug]/announcements/[id]/like", "team/[slug]/messages/threads", "team/[slug]/messages/threads/[threadId]/messages",
    "team/[slug]/messages/threads/[threadId]/attachments/sign", "team/[slug]/messages/threads/resolve",
    "team/[slug]/messages/groups", "team/[slug]/messages/groups/[threadId]", "team/[slug]/messages/groups/[threadId]/participants",
    "team/[slug]/attendance/[date]", "team/[slug]/todo/tasks", "team/[slug]/todo/tasks/[taskId]/acknowledgment",
    "team/[slug]/sponsors", "team/[slug]/shop/products", "team/[slug]/files/upload", "team/[slug]/clearance",
    "team/[slug]/staff/invite", "team/[slug]/parent-access-requests/[id]", "team/[slug]/athlete-requests/[id]",
    "team/[slug]/family/requests", "team/[slug]/join-codes", "team/[slug]/settings/branding", "team/[slug]/contacts",
    "team/[slug]/outreach/[athleteId]", "team/[slug]/calendar/subscription",
    "admin/campaigns/[slug]", "admin/campaign", "admin/athletes", "admin/coaches", "auth/staff-invite-accept",
  ]) {
    if (area === "auth/staff-invite-accept") continue; // guarded inside acceptStaffInvitation (staffInvite.ts)
    assert.ok(guardedRoutes.has(area), `${area} is not guarded`);
  }
  const staff = readFileSync(join(process.cwd(), "src", "lib", "staffInvite.ts"), "utf8");
  assert.match(staff, /if \(await seasonWriteBlocked\(invite\.campaign_slug\)\)/);
});
