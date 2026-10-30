// Fictional data for the isolated Team App demo (/preview/team-app).
//
// Mirrors the fictional Sunridge Valley Comets team built in QA with the
// real app (coach Dana Whitfield, athlete Jordan Ellis, parent Erin Ellis,
// the same roster, schedule and updates), plus the fundraising figures
// used on /fundraising. NOTHING here is a real school, person or record,
// and nothing is read from or written to any database: rows are built in
// the visitor's browser, shaped like the app's own row types so the real
// presentation components can render them.
//
// Dates are relative to the visitor's "today" so Next Up and the week's
// schedule always make sense.

import type { AnnouncementRow, CalendarEventRow } from "@/lib/teamData";
import type { TeamActor } from "@/lib/permissions";
import { SAMPLE_CAMPAIGN, SAMPLE_TEAM } from "../demo/fixtures.ts";

import type { DemoRole } from "./demoProtocol";

/** Fictional slug — never a real team. Links built from it are intercepted. */
export const DEMO_SLUG = "sunridge-valley-football-demo";

/** Same shell settings as the QA team: branding not customized, so the
 *  app's default ELF orange/yellow theme applies (resolveTeamTheme). */
export const DEMO_TEAM = {
  schoolName: SAMPLE_TEAM.schoolName,
  sportName: SAMPLE_TEAM.sportName,
  mascot: "",
  season: "2027",
  logoUrl: SAMPLE_TEAM.logoUrl,
  primaryColor: "#1B4FA8",
  secondaryColor: "#C4A35A",
  brandingCustomized: false,
} as const;

/** Same totals as the /fundraising sample campaign. */
export const DEMO_FUNDRAISER = {
  raisedCents: SAMPLE_CAMPAIGN.raised * 100,
  goalCents: SAMPLE_CAMPAIGN.goal * 100,
} as const;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const JORDAN_ELLIS_ID = id(2);

export const DEMO_ROSTER = [
  { id: id(1), name: "Maya Torres", position: "Wide Receiver", classYear: "Senior", jersey: "1" },
  { id: JORDAN_ELLIS_ID, name: "Jordan Ellis", position: "Quarterback", classYear: "Junior", jersey: "7" },
  { id: id(3), name: "Caleb Brooks", position: "Linebacker", classYear: "Senior", jersey: "44" },
  { id: id(4), name: "Isaiah Grant", position: "Running Back", classYear: "Sophomore", jersey: "22" },
  { id: id(5), name: "Noah Ramirez", position: "Offensive Line", classYear: "Junior", jersey: "71" },
  { id: id(6), name: "Elijah Carter", position: "Kicker", classYear: "Freshman", jersey: "3" },
  { id: id(7), name: "Mason Reyes", position: "Cornerback", classYear: "Sophomore", jersey: "24" },
  { id: id(8), name: "Owen Patel", position: "Safety", classYear: "Junior", jersey: "31" },
  { id: id(9), name: "Lucas Bennett", position: "Tight End", classYear: "Senior", jersey: "88" },
  { id: id(10), name: "Gabriel Nguyen", position: "Defensive Line", classYear: "Freshman", jersey: "95" },
] as const;

/** The signed-in person for each role, as the app's own actor shape — so
 *  the real permission helpers (isStaff, isHeadCoach, buildQuickActions,
 *  announcement visibility) decide what each role sees. */
export const DEMO_ACTORS: Record<DemoRole, TeamActor> = {
  coach: { kind: "coach", session: { id: id(101), name: "Dana Whitfield", role: "head_coach", campaign_slug: DEMO_SLUG } },
  athlete: { kind: "member", session: { id: id(201), name: "Jordan Ellis", role: "athlete", campaign_slug: DEMO_SLUG, athlete_id: JORDAN_ELLIS_ID, account_id: null } },
  parent: { kind: "member", session: { id: id(301), name: "Erin Ellis", role: "parent", campaign_slug: DEMO_SLUG, athlete_id: JORDAN_ELLIS_ID, account_id: null } },
};

// ── Dates ───────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

// ── Calendar ────────────────────────────────────────────────────────────────

type EventSeed = { offset: number; title: string; type: CalendarEventRow["type"]; start: string; end: string; location: string; description: string };

// Offsets are relative to game day (the coming Friday), two weeks of it.
const WEEK: Omit<EventSeed, "offset">[] = [
  { title: "Practice", type: "practice", start: "15:45", end: "17:45", location: "Comets Field", description: "Helmets and shells. Install this week's game plan." },
  { title: "Film Session & Team Meeting", type: "team", start: "15:30", end: "16:30", location: "Room 214", description: "Review last week's film. Bring your playbook." },
  { title: "Practice", type: "practice", start: "15:45", end: "17:45", location: "Comets Field", description: "Full pads." },
  { title: "Practice (late start)", type: "practice", start: "16:30", end: "18:00", location: "Comets Field", description: "Field is being lined for Friday's game. Bring both practice jerseys." },
];

const SEEDS: EventSeed[] = [
  ...WEEK.map((e, i) => ({ ...e, offset: i - 4 })),
  { offset: 0, title: "Game vs. Mesa Ridge Rattlers (Away)", type: "team", start: "19:00", end: "21:30", location: "Mesa Ridge Stadium", description: "Bus departs from the gym lot at 4:45 PM. Game uniforms: white jerseys." },
  ...WEEK.map((e, i) => ({ ...e, offset: i + 3 })),
  { offset: 6, title: "Team Pasta Dinner", type: "team", start: "18:00", end: "19:30", location: "School Cafeteria", description: "Families welcome before the home finale." },
  { offset: 7, title: "Game vs. Canyon View Coyotes (Home)", type: "team", start: "19:00", end: "21:30", location: "Comets Field", description: "Senior night. Arrive by 5:30 PM in game uniforms." },
];

/** Upcoming events (today onward), soonest first — what the app's
 *  getCalendarEvents(slug, true) returns for Home's Next Up. */
export function buildDemoUpcoming(today: Date): CalendarEventRow[] {
  const gameDay = addDays(today, (5 - today.getDay() + 7) % 7);
  const todayIso = isoDate(today);
  return SEEDS
    .map((s, i): CalendarEventRow => ({
      id: id(1000 + i),
      campaign_slug: DEMO_SLUG,
      title: s.title,
      event_date: isoDate(addDays(gameDay, s.offset)),
      event_time: "",
      start_time: s.start,
      end_time: s.end,
      location: s.location,
      description: s.description,
      type: s.type,
      created_at: today.toISOString(),
    }))
    .filter((e) => e.event_date >= todayIso)
    .sort((a, b) => (a.event_date + (a.start_time ?? "")).localeCompare(b.event_date + (b.start_time ?? "")));
}

// ── Announcements ───────────────────────────────────────────────────────────

type AnnouncementSeed = Pick<AnnouncementRow, "title" | "body" | "category" | "priority" | "recipient_scope"> & { minutesAgo: number };

const ANNOUNCEMENTS: AnnouncementSeed[] = [
  { minutesAgo: 40, priority: "pinned", category: "schedule", recipient_scope: "everyone", title: "Thursday practice starts at 4:30", body: "The field is being lined for Friday's game, so Thursday practice starts at 4:30 instead of 3:45. Same location. Bring both practice jerseys." },
  { minutesAgo: 95, priority: "normal", category: "schedule", recipient_scope: "athletes", title: "Athletes: film session Tuesday", body: "Film starts at 3:30 in Room 214. We'll walk through the red-zone package for Mesa Ridge. Bring your playbooks." },
  { minutesAgo: 300, priority: "normal", category: "team", recipient_scope: "parents", title: "Parents: team pasta dinner before the home finale", body: "Join us in the cafeteria before the home finale. Sign up in the parent group chat to bring a dish." },
  { minutesAgo: 1440, priority: "high", category: "travel", recipient_scope: "everyone", title: "Away game Friday: bus leaves at 4:45 PM", body: "We travel to Mesa Ridge on Friday. Be at the gym lot by 4:30 in team travel gear. White game jerseys. Kickoff is 7:00 PM." },
  { minutesAgo: 4320, priority: "normal", category: "team", recipient_scope: "everyone", title: "Welcome to the Comets Team App", body: "Coaches, athletes and parents — this is where schedules, updates and messages live this season. Turn on notifications so you never miss a change." },
];

/** Who sees an announcement — the app's rule (notifications.ts
 *  isVisibleToMember via announcementVisibility.ts), restated here because
 *  that module also holds server-side database calls and must never be
 *  bundled into the demo. teamAppDemo.test.ts checks the two agree. */
export function isVisibleToDemoRole(a: Pick<AnnouncementRow, "recipient_scope" | "recipient_athlete_id">, role: DemoRole): boolean {
  if (role === "coach") return true;
  switch (a.recipient_scope) {
    case "everyone":         return true;
    case "athletes":         return role === "athlete";
    case "parents":          return role === "parent";
    case "boosters":         return false;
    case "athlete_specific": return a.recipient_athlete_id === JORDAN_ELLIS_ID;
    default:                 return true;
  }
}

/** Every announcement (newest first), authored by the fictional head coach.
 *  Callers filter per role with isVisibleToDemoRole. */
export function buildDemoAnnouncements(now: Date): AnnouncementRow[] {
  return ANNOUNCEMENTS.map((a, i): AnnouncementRow => {
    const at = new Date(now.getTime() - a.minutesAgo * 60_000).toISOString();
    return {
      id: id(2000 + i),
      campaign_slug: DEMO_SLUG,
      title: a.title,
      body: a.body,
      category: a.category,
      priority: a.priority,
      author_name: "Dana Whitfield",
      // Stored as the display label, exactly as the announcements API does
      // (staffRoleLabel(role)) — so the card renders the same role chip.
      author_role: "Head Coach",
      recipient_scope: a.recipient_scope,
      recipient_athlete_id: null,
      created_at: at,
      updated_at: at,
      attachment_id: null,
      attachment: null,
      author_photo_url: null,
    };
  });
}
