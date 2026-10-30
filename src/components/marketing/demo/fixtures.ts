// Fictional sample data for every public marketing preview — the Team App
// simulator, the fundraising campaign preview and the Community Partner
// examples. NOTHING here is a real school, athlete, family, donor, coach or
// business, and nothing here is read from or written to any database.
// Every surface that renders this data labels it as a sample.
//
// Client-safe and dependency-free on purpose: demoIsolation.test.ts fails
// the build if this file (or anything under components/marketing/demo, or
// the preview route) imports a database helper, an API route, auth,
// sessions, Stripe or email.

export const SAMPLE_NOTICE = "Sample team — every name, amount and business here is fictional.";

export const SAMPLE_TEAM = {
  slug: "sample-sunridge-valley-football",
  schoolName: "Sunridge Valley High School",
  shortName: "Sunridge Valley",
  sportName: "Varsity Football",
  mascot: "Comets",
  season: "Fall 2026",
  location: "Sample City, AZ",
  primaryColor: "#1D3E8A",
  secondaryColor: "#F2B705",
  description:
    "The Sunridge Valley Comets are raising money for travel to away games, new practice equipment and team meals for the season.",
} as const;

export const SAMPLE_CAMPAIGN = {
  goal: 15000,
  raised: 9840,
  donors: 112,
  daysLeft: 18,
} as const;

/** Stable, UUID-shaped fake ids (never a real record). */
const fakeId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export type SampleAthlete = { id: string; name: string; event: string | null; class_year: string; raised: number; goal: number };

export const SAMPLE_ATHLETES: SampleAthlete[] = [
  { id: fakeId(1), name: "Maya Torres",     event: "Wide Receiver", class_year: "Senior",    raised: 1240, goal: 1000 },
  { id: fakeId(2), name: "Jordan Ellis",    event: "Quarterback",   class_year: "Junior",    raised: 1105, goal: 1000 },
  { id: fakeId(3), name: "Caleb Brooks",    event: "Linebacker",    class_year: "Senior",    raised: 960,  goal: 1000 },
  { id: fakeId(4), name: "Isaiah Grant",    event: "Running Back",  class_year: "Sophomore", raised: 875,  goal: 750 },
  { id: fakeId(5), name: "Noah Ramirez",    event: "Offensive Line", class_year: "Junior",   raised: 790,  goal: 750 },
  { id: fakeId(6), name: "Elijah Carter",   event: "Kicker",        class_year: "Freshman",  raised: 640,  goal: 500 },
  { id: fakeId(7), name: "Mason Reyes",     event: "Cornerback",    class_year: "Sophomore", raised: 585,  goal: 750 },
  { id: fakeId(8), name: "Owen Patel",      event: "Safety",        class_year: "Junior",    raised: 520,  goal: 750 },
  { id: fakeId(9), name: "Lucas Bennett",   event: "Tight End",     class_year: "Senior",    raised: 455,  goal: 1000 },
  { id: fakeId(10), name: "Gabriel Nguyen", event: "Defensive Line", class_year: "Freshman", raised: 380,  goal: 500 },
];

export const SAMPLE_COACHES = [
  { id: fakeId(101), name: "Dana Whitfield", role: "head_coach" as const, raised: 1290, goal_cents: 150000 },
];

export const SAMPLE_DONATIONS = [
  { name: "The Alvarez Family", amount: 100, message: "Go Comets! Have a great season.", time: "2h ago" },
  { name: "Anonymous",          amount: 50,  message: "",                                 time: "5h ago" },
  { name: "Grandma Ellis",      amount: 75,  message: "So proud of you, Jordan!",          time: "1d ago" },
  { name: "Coach K.",           amount: 25,  message: "",                                  time: "1d ago" },
  { name: "The Brooks Family",  amount: 150, message: "For the away-game bus. Good luck!", time: "2d ago" },
  { name: "Sam P.",             amount: 40,  message: "",                                  time: "3d ago" },
];

export const SAMPLE_FUND_USES = [
  { icon: "plane",    label: "Travel to away games", desc: "Bus travel for every away game on the schedule." },
  { icon: "shoe",     label: "Practice equipment",   desc: "Blocking sleds, agility gear and training tools." },
  { icon: "shirt",    label: "Uniforms",             desc: "Replacement game jerseys and practice gear." },
  { icon: "utensils", label: "Team meals",           desc: "Pre-game meals before Friday nights." },
];

/** Fictional local businesses — text tiles only, never a real logo. */
export const SAMPLE_PARTNERS = [
  { id: fakeId(201), business_name: "Comet Coffee Co.",        short_description: "Fresh roasts, two blocks from the stadium.", website_url: null, logo_url: null },
  { id: fakeId(202), business_name: "Valley Family Dental",    short_description: "Proud supporter of Comets athletics.",       website_url: null, logo_url: null },
  { id: fakeId(203), business_name: "Ridgeline Auto Care",     short_description: "Oil changes, tires and brakes.",             website_url: null, logo_url: null },
  { id: fakeId(204), business_name: "Sunridge Pizza Kitchen",  short_description: "Team dinners every Thursday.",               website_url: null, logo_url: null },
  { id: fakeId(205), business_name: "Desert Bloom Realty",     short_description: "Helping local families find home.",          website_url: null, logo_url: null },
  { id: fakeId(206), business_name: "Summit Physical Therapy", short_description: "Sports injury care and recovery.",           website_url: null, logo_url: null },
];

// ── Team App simulator ──────────────────────────────────────────────────────

export type SampleAnnouncement = { id: string; author: string; role: string; title: string; body: string; time: string; comments: number };

export const SAMPLE_ANNOUNCEMENTS: SampleAnnouncement[] = [
  {
    id: "a1",
    author: "Coach Whitfield",
    role: "Head Coach",
    title: "Thursday practice moves to 4:30",
    body: "The field is being lined for Friday's game, so Thursday practice starts at 4:30 instead of 3:45. Same location. Bring both practice jerseys.",
    time: "Today, 9:12 AM",
    comments: 6,
  },
  {
    id: "a2",
    author: "Coach Whitfield",
    role: "Head Coach",
    title: "Away game Friday — bus leaves at 4:00",
    body: "We play at Canyon Mesa (sample) Friday at 7:00. The bus leaves the gym lot at 4:00 sharp. Parents: pickup back at school is around 10:30.",
    time: "Yesterday",
    comments: 11,
  },
  {
    id: "a3",
    author: "Coach Whitfield",
    role: "Head Coach",
    title: "Fundraiser is 66% to goal",
    body: "Thank you, families! We're at $9,840 of our $15,000 goal with 18 days left. Share your athlete link with one more person this week.",
    time: "Mon",
    comments: 4,
  },
];

export type SampleEvent = { id: string; day: string; date: string; title: string; time: string; place: string; kind: "Game" | "Practice" | "Meeting" };

export const SAMPLE_EVENTS: SampleEvent[] = [
  { id: "e1", day: "THU", date: "Nov 5",  title: "Practice",               time: "4:30 – 6:30 PM", place: "Comets Stadium",          kind: "Practice" },
  { id: "e2", day: "FRI", date: "Nov 6",  title: "at Canyon Mesa (sample)", time: "7:00 PM",        place: "Bus leaves 4:00 PM",      kind: "Game" },
  { id: "e3", day: "MON", date: "Nov 9",  title: "Film & lift",            time: "3:45 – 5:15 PM", place: "Weight room",             kind: "Practice" },
  { id: "e4", day: "TUE", date: "Nov 10", title: "Parent meeting",         time: "6:00 PM",        place: "Library",                 kind: "Meeting" },
];

export type SampleThread = { id: string; with: string; preview: string; time: string; unread: boolean; note?: string; messages: { from: string; mine: boolean; body: string; time: string }[] };

export const SAMPLE_THREADS_COACH: SampleThread[] = [
  {
    id: "t1",
    with: "Jordan Ellis + parent",
    note: "Parent/guardian included. Head coach oversight applies.",
    preview: "Thanks Coach, he'll be there at 4:30.",
    time: "10:04 AM",
    unread: true,
    messages: [
      { from: "Coach Whitfield", mine: true,  body: "Jordan — reminder that film starts at 3:45 Monday. Please bring your playbook.", time: "9:40 AM" },
      { from: "Erin Ellis (parent)", mine: false, body: "Thanks Coach, he'll be there at 4:30.", time: "10:04 AM" },
    ],
  },
  {
    id: "t2",
    with: "Maya Torres + parent",
    note: "Parent/guardian included. Head coach oversight applies.",
    preview: "Great work at practice today.",
    time: "Yesterday",
    unread: false,
    messages: [
      { from: "Coach Whitfield", mine: true, body: "Great work at practice today. Keep it up Friday.", time: "Yesterday" },
    ],
  },
];

export const SAMPLE_THREADS_PARENT: SampleThread[] = [
  {
    id: "p1",
    with: "Coach Whitfield",
    note: "Your athlete is included. Head coach oversight applies.",
    preview: "Reminder that film starts at 3:45 Monday.",
    time: "9:40 AM",
    unread: true,
    messages: [
      { from: "Coach Whitfield", mine: false, body: "Jordan — reminder that film starts at 3:45 Monday. Please bring your playbook.", time: "9:40 AM" },
    ],
  },
];

/** Roster for the coach's attendance tab (local-only toggles). */
export const SAMPLE_ROSTER = SAMPLE_ATHLETES.slice(0, 7).map((a) => ({ id: a.id, name: a.name, position: a.event ?? "" }));

/** The athlete and parent views follow this one sample athlete. */
export const SAMPLE_ME = SAMPLE_ATHLETES[1]; // Jordan Ellis
export const SAMPLE_PARENT_NAME = "Erin Ellis";

/** Leaderboard rank for an athlete id (1-based, by amount raised). */
export function sampleRank(id: string): number {
  return [...SAMPLE_ATHLETES].sort((a, b) => b.raised - a.raised).findIndex((a) => a.id === id) + 1;
}

export function usd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}
