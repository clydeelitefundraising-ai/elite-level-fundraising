// Fictional fundraising records for the isolated Team App demo
// (/preview/team-app): the Sunridge Valley Comets campaign, its donations,
// the athletes' and the head coach's fundraising contacts, and the coaches'
// follow-up notes. NOTHING here is a real person, donor, phone number,
// address or payment, and nothing is read from or written to any database.
//
// The totals are the /fundraising sample campaign's (demo/fixtures.ts):
// $9,840 raised toward $15,000 from 112 donations, 18 days left, each
// athlete's raised amount and goal, and the head coach's own $1,290 of
// $1,500. The donations are generated deterministically so they add up to
// exactly those amounts; the newest six are the sample page's recent
// donations. Phone numbers use the 555-01xx range reserved for fiction and
// email addresses use example.com.

import type { CampaignSettings, DonationRow } from "@/lib/supabase";
import type { OutreachRow, TeamAthleteRow } from "@/lib/teamData";
import { SAMPLE_ATHLETES, SAMPLE_CAMPAIGN, SAMPLE_COACHES, SAMPLE_DONATIONS, SAMPLE_TEAM } from "../demo/fixtures.ts";
import { DEMO_ROSTER, DEMO_SLUG, DEMO_TEAM, JORDAN_ELLIS_ID, addDaysISO, demoTodayISO } from "./demoData.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** The head coach (DEMO_ACTORS.coach) — an active fundraising participant,
 *  like the /fundraising sample's coach card. */
export const DEMO_HEAD_COACH_ID = id(101);
export const DEMO_ASSISTANT_COACH_ID = id(102);

const GRAD_YEAR: Record<string, number> = { Senior: 2027, Junior: 2028, Sophomore: 2029, Freshman: 2030 };

/** The roster as the app stores it (TeamAthleteRow). Goals are the sample
 *  page's; the coach-only contact fields are fictional. */
export const DEMO_TEAM_ATHLETES: TeamAthleteRow[] = DEMO_ROSTER.map((a, i) => {
  const sample = SAMPLE_ATHLETES.find(s => s.id === a.id)!;
  const [first, last] = a.name.toLowerCase().split(" ");
  return {
    id: a.id,
    campaign_slug: DEMO_SLUG,
    name: a.name,
    event: a.position,
    class_year: a.classYear,
    created_at: "2026-08-01T15:00:00.000Z",
    contact_phone: `(480) 555-01${String(10 + i * 3).padStart(2, "0")}`,
    contact_email: i % 3 === 2 ? null : `${first}.${last}@example.com`,
    jersey_number: Number(a.jersey),
    grad_year: GRAD_YEAR[a.classYear] ?? null,
    profile_photo: null,
    goal_cents: sample.goal * 100,
  };
});

/** campaign_settings for the demo team — fundraising on, coach
 *  fundraising on, 18 days left (the sample page's countdown). */
export function buildDemoSettings(now: Date): CampaignSettings {
  const today = demoTodayISO(now);
  return {
    campaign_slug: DEMO_SLUG,
    school_name: DEMO_TEAM.schoolName,
    sport_name: DEMO_TEAM.sportName,
    mascot: DEMO_TEAM.mascot,
    goal_cents: SAMPLE_CAMPAIGN.goal * 100,
    // Midnight in Arizona (07:00 UTC) 18 days from today, so the app's
    // ceil(days) countdown reads exactly 18 all day.
    deadline: `${addDaysISO(today, SAMPLE_CAMPAIGN.daysLeft)}T07:00:00.000Z`,
    primary_color: DEMO_TEAM.primaryColor,
    secondary_color: DEMO_TEAM.secondaryColor,
    branding_customized: DEMO_TEAM.brandingCustomized,
    location: "Sunridge Valley, AZ",
    season: DEMO_TEAM.season,
    logo_url: DEMO_TEAM.logoUrl,
    archived: false,
    fundraising_enabled: true,
    allow_coach_fundraising: true,
    default_athlete_goal_cents: 50_000,
    show_booster_in_staff_roster: true,
    description: SAMPLE_TEAM.description,
  } as CampaignSettings;
}

// ── Donations ───────────────────────────────────────────────────────────────

/** Tiny deterministic generator, so every visitor sees the same records. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

/** Splits `total` dollars into `n` gifts (multiples of $5, at least $10). */
function split(total: number, n: number, seed: number): number[] {
  const rand = lcg(seed);
  const out: number[] = [];
  let remaining = total;
  for (let i = 0; i < n - 1; i++) {
    const left = n - i;
    const avg = remaining / left;
    let amt = Math.round((avg * (0.5 + rand() * 1.1)) / 5) * 5;
    amt = Math.max(10, Math.min(amt, remaining - 10 * (left - 1)));
    out.push(amt);
    remaining -= amt;
  }
  out.push(remaining);
  return out;
}

const DONORS = [
  "Megan R.", "The Patterson Family", "Chris D.", "Linda K.", "Uncle Ray", "The Nakamura Family", "Tony B.", "Rachel S.",
  "Aunt Denise", "Mark & Julie H.", "The Okafor Family", "Grandpa Joe", "Kayla M.", "Steve W.", "The Delgado Family",
  "Pam & Rick L.", "Jessica T.", "Brandon F.", "The Whitaker Family", "Coach Ramirez", "Monica V.", "Derek J.",
  "The Castillo Family", "Heather P.", "Aunt Lisa", "Greg N.", "The Sullivan Family", "Tara C.", "Jim & Carol D.",
  "Natalie G.", "Ryan O.", "The Chen Family", "Brooke A.", "Uncle Mike", "Dawn E.", "The Fischer Family", "Luis M.",
  "Karen Q.", "Grandma Rose", "The Lopez Family", "Sean K.", "Amber Y.", "Paul & Nina S.", "The Harper Family",
];

const MESSAGES = [
  "Go Comets!", "Good luck this season!", "Have a great season!", "So proud of you!", "Go get 'em!",
  "Happy to support the team.", "Comets on three!", "Play hard and have fun!", "Keep working hard!",
  "Good luck Friday night!",
];

/** Gifts per athlete (newest-first order is set below), the coach and the
 *  team in general: 94 + 10 + 8 = 112 donations. */
const GIFT_COUNTS = [13, 12, 11, 10, 10, 9, 8, 8, 7, 6];
const COACH_GIFTS = 10;
const TEAM_GIFTS = 8;
const TEAM_GENERAL_DOLLARS =
  SAMPLE_CAMPAIGN.raised - SAMPLE_ATHLETES.reduce((s, a) => s + a.raised, 0) - SAMPLE_COACHES[0].raised;

/** The sample page's recent donations, newest first, and who they support
 *  (null = the team in general). */
const RECENT: { donor: string; amount: number; message: string; hoursAgo: number; athlete: string | null }[] = [
  { donor: SAMPLE_DONATIONS[0].name, amount: SAMPLE_DONATIONS[0].amount, message: SAMPLE_DONATIONS[0].message, hoursAgo: 2, athlete: "Maya Torres" },
  { donor: SAMPLE_DONATIONS[1].name, amount: SAMPLE_DONATIONS[1].amount, message: SAMPLE_DONATIONS[1].message, hoursAgo: 5, athlete: null },
  { donor: SAMPLE_DONATIONS[2].name, amount: SAMPLE_DONATIONS[2].amount, message: SAMPLE_DONATIONS[2].message, hoursAgo: 26, athlete: "Jordan Ellis" },
  { donor: SAMPLE_DONATIONS[3].name, amount: SAMPLE_DONATIONS[3].amount, message: SAMPLE_DONATIONS[3].message, hoursAgo: 31, athlete: null },
  { donor: SAMPLE_DONATIONS[4].name, amount: SAMPLE_DONATIONS[4].amount, message: SAMPLE_DONATIONS[4].message, hoursAgo: 50, athlete: "Caleb Brooks" },
  { donor: SAMPLE_DONATIONS[5].name, amount: SAMPLE_DONATIONS[5].amount, message: SAMPLE_DONATIONS[5].message, hoursAgo: 74, athlete: "Isaiah Grant" },
];

type Gift = { donor: string | null; amount: number; message: string | null; athleteId: string | null; coachId: string | null; hoursAgo: number | null };

/** Every donation to the demo campaign, newest first (getDonations order). */
export function buildDemoDonations(now: Date): DonationRow[] {
  const rand = lcg(2026);
  const gifts: Gift[] = [];
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

  const subjects: { athleteId: string | null; coachId: string | null; dollars: number; count: number; family: string | null }[] = [
    ...SAMPLE_ATHLETES.map((a, i) => ({ athleteId: a.id, coachId: null, dollars: a.raised, count: GIFT_COUNTS[i], family: `The ${a.name.split(" ")[1]} Family` })),
    { athleteId: null, coachId: DEMO_HEAD_COACH_ID, dollars: SAMPLE_COACHES[0].raised, count: COACH_GIFTS, family: null },
    { athleteId: null, coachId: null, dollars: TEAM_GENERAL_DOLLARS, count: TEAM_GIFTS, family: null },
  ];

  subjects.forEach((sub, si) => {
    const athleteName = sub.athleteId ? SAMPLE_ATHLETES.find(a => a.id === sub.athleteId)!.name : null;
    const fixed = RECENT.filter(r => (r.athlete ?? null) === athleteName && !sub.coachId);
    for (const r of fixed) {
      gifts.push({ donor: r.donor === "Anonymous" ? null : r.donor, amount: r.amount, message: r.message || null, athleteId: sub.athleteId, coachId: null, hoursAgo: r.hoursAgo });
    }
    const amounts = split(sub.dollars - fixed.reduce((s, r) => s + r.amount, 0), sub.count - fixed.length, 101 + si);
    amounts.forEach((amount, k) => {
      const first = athleteName?.split(" ")[0];
      const donor = k === 0 && sub.family ? sub.family : rand() < 0.08 ? null : pick(DONORS);
      const message = rand() < 0.35
        ? (first && rand() < 0.5 ? `Go get 'em, ${first}!` : pick(MESSAGES))
        : null;
      gifts.push({ donor, amount, message, athleteId: sub.athleteId, coachId: sub.coachId, hoursAgo: null });
    });
  });

  // Undated gifts are spread over the 3½–44 days before the recent ones,
  // in a shuffled (but fixed) order.
  const undated = gifts.filter(g => g.hoursAgo === null);
  for (let i = undated.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [undated[i], undated[j]] = [undated[j], undated[i]];
  }
  undated.forEach((g, i) => { g.hoursAgo = 84 + Math.round((i / undated.length) * (44 * 24 - 84)) + Math.floor(rand() * 9); });

  return gifts
    .sort((a, b) => a.hoursAgo! - b.hoursAgo!)
    .map((g, i): DonationRow => {
      const athlete = g.athleteId ? DEMO_ROSTER.find(a => a.id === g.athleteId)! : null;
      return {
        id: id(5000 + i),
        stripe_session_id: `demo_${String(i).padStart(4, "0")}`,
        donor_name: g.donor,
        amount_cents: g.amount * 100,
        athlete_name: athlete?.name ?? null,
        athlete_id: g.athleteId,
        coach_id: g.coachId,
        donation_message: g.message,
        campaign_slug: DEMO_SLUG,
        created_at: new Date(now.getTime() - g.hoursAgo! * 3_600_000 - (i % 7) * 60_000).toISOString(),
      };
    });
}

// ── Coach fundraising ───────────────────────────────────────────────────────

export type DemoCoachParticipant = { coach_id: string; name: string; role: "head_coach" | "assistant_coach"; goal_cents: number | null };

/** Active coach fundraising participants (campaign_coach_fundraisers). */
export const DEMO_COACH_PARTICIPANTS: DemoCoachParticipant[] = [
  { coach_id: DEMO_HEAD_COACH_ID, name: "Dana Whitfield", role: "head_coach", goal_cents: SAMPLE_COACHES[0].goal_cents },
];

// ── Fundraising contacts ────────────────────────────────────────────────────

export type DemoContact = {
  id: string;
  phone: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  relationship: string | null;
  relationship_other: string | null;
  notes: string | null;
  added_by_type: "athlete" | "parent" | "coach";
  created_at: string;
};

/** Owner key: an athlete id, or "coach:<id>" for a coach participant. */
export const coachOwner = (coachId: string) => `coach:${coachId}`;

/** The team's default contact goal (fundraising_contact_goals). */
export const DEMO_CONTACT_GOAL = 10;

/** Contacts added per athlete (roster order) and by the head coach. */
const CONTACT_COUNTS = [12, 7, 10, 9, 4, 11, 0, 6, 3, 2];
const COACH_CONTACTS = 8;

const CONTACT_PEOPLE: [string, string, string][] = [
  ["Linda", "Morales", "Family"], ["Greg", "Hansen", "Friend"], ["Patricia", "Young", "Neighbor"], ["Victor", "Shah", "Coworker"],
  ["Elena", "Ruiz", "Family"], ["Tom", "Becker", "Friend"], ["Sandra", "Kim", "Teacher"], ["Darnell", "Price", "Family"],
  ["Holly", "Graves", "Neighbor"], ["Ivan", "Petrov", "Business"], ["Joyce", "Whitman", "Family"], ["Kevin", "Lam", "Friend"],
  ["Rosa", "Medina", "Family"], ["Alan", "Fisher", "Coworker"], ["Brenda", "Cole", "Neighbor"], ["Omar", "Haddad", "Friend"],
];

const NOTES = [null, null, "Prefers a text.", null, "Supported the team last season.", null, null, "Call after 5 PM."];

export function buildDemoContacts(now: Date): Record<string, DemoContact[]> {
  const out: Record<string, DemoContact[]> = {};
  let n = 0;
  const make = (owner: string, count: number, addedBy: (k: number) => DemoContact["added_by_type"], lastName: string | null) => {
    out[owner] = Array.from({ length: count }, (_, k) => {
      const [first, last, rel] = CONTACT_PEOPLE[(n + k * 5) % CONTACT_PEOPLE.length];
      const family = rel === "Family" && lastName && k % 2 === 0;
      const surname = family ? lastName : last;
      const num = n++;
      return {
        id: id(6000 + num),
        phone: num % 4 === 3 ? null : `(602) 555-01${String(num % 100).padStart(2, "0")}`,
        email: num % 3 === 0 || num % 4 === 3 ? `${first.toLowerCase()}.${surname.toLowerCase()}@example.com` : null,
        first_name: first,
        last_name: surname,
        relationship: rel,
        relationship_other: null,
        notes: NOTES[num % NOTES.length],
        added_by_type: addedBy(k),
        created_at: new Date(now.getTime() - (30 - k * 2) * 86_400_000 - num * 3_600_000).toISOString(),
      };
    }).reverse(); // newest first, like the API
  };
  DEMO_ROSTER.forEach((a, i) => make(a.id, CONTACT_COUNTS[i], k => (a.id === JORDAN_ELLIS_ID && k % 3 === 1 ? "parent" : "athlete"), a.name.split(" ")[1]));
  make(coachOwner(DEMO_HEAD_COACH_ID), COACH_CONTACTS, () => "coach", null);
  return out;
}

// ── Follow-up (outreach) history ────────────────────────────────────────────

/** Coaches' follow-up notes (athlete_outreach), newest first per athlete or
 *  "coach:<id>". The latest entry is each row's current status. */
export function buildDemoOutreach(now: Date): Record<string, OutreachRow[]> {
  const daysAgo = (d: number, h = 0) => new Date(now.getTime() - d * 86_400_000 - h * 3_600_000).toISOString();
  const row = (n: number, athleteId: string, status: OutreachRow["status"], note: string | null, by: string, at: string): OutreachRow =>
    ({ id: id(6500 + n), athlete_id: athleteId, campaign_slug: DEMO_SLUG, status, note, contacted_by: by, coach_id: null, created_at: at });
  const [, , , , noah, , mason, owen, lucas, gabriel] = DEMO_ROSTER.map(a => a.id);
  return {
    [mason]: [
      row(1, mason, "needs_follow_up", "No contacts entered yet. Asked Mason to add family contacts this week.", "Dana Whitfield", daysAgo(3, 2)),
    ],
    [gabriel]: [
      row(2, gabriel, "needs_follow_up", "Only 2 contacts. Will check in with his parents at Friday's game.", "Marcus Hale", daysAgo(2, 5)),
      row(3, gabriel, "contacted", "Reminded Gabriel at practice to add contacts.", "Dana Whitfield", daysAgo(9, 1)),
    ],
    [lucas]: [
      row(4, lucas, "contacted", "Talked after practice; adding grandparents tonight.", "Dana Whitfield", daysAgo(4, 3)),
    ],
    [noah]: [
      row(5, noah, "resolved", "Added his contacts and shared his page with family.", "Marcus Hale", daysAgo(6, 4)),
      row(6, noah, "contacted", "Sent a reminder about the contact goal.", "Dana Whitfield", daysAgo(12, 2)),
    ],
    [owen]: [
      row(7, owen, "contacted", null, "Dana Whitfield", daysAgo(8, 6)),
    ],
  };
}

// ── Display goal ────────────────────────────────────────────────────────────

/** lib/platform/donations.ts getDisplayGoalCents, restated: that module
 *  also holds server-side database code, which the demo must never bundle.
 *  teamAppDemoTeam.test.ts checks the two agree. */
export function demoDisplayGoalCents(baseGoalCents: number, raisedCents: number): number {
  if (!Number.isFinite(baseGoalCents) || baseGoalCents <= 0) return 0;
  const raised = Number.isFinite(raisedCents) && raisedCents > 0 ? raisedCents : 0;
  const buffer = Math.round(baseGoalCents * 0.10);
  const step    = Math.max(1, Math.round(baseGoalCents * 0.20));
  let displayGoal = baseGoalCents;
  while (raised >= displayGoal - buffer) displayGoal += step;
  return displayGoal;
}
