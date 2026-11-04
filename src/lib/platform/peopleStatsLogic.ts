// People on ELF — the counting rules. Pure and dependency-free: the loader
// (peopleStats.ts) fetches narrow rows and hands them here; only aggregate
// numbers come back out. Nothing in the result identifies anyone.
//
// A "person" is one connected group of team records:
//   • rows linked to the same ELF account (account_id) are one person,
//     whatever team, season or role;
//   • a joined athlete (team_members role "athlete" pointing at a roster row)
//     is the same person as that roster row;
//   • a roster athlete carried into a new season (previous_season_athlete_id)
//     is the same person in both seasons;
//   • coach/staff rows (team_coaches) with the same normalized email are one
//     person — coaches are created per team with a required email.
// Nothing is merged by name, and member/parent/booster emails or phones are
// not used: those are optional and often shared within a family. A team
// member without an account is therefore one person per row, and an
// unregistered athlete on two different teams is counted twice.
//
// Status (per person): "account_linked" when at least one of their team
// records is linked to an ELF account — a coach email match alone never
// counts as linked; "team_login_only" when they have team logins (member or
// coach rows) but none is linked; "roster_only" for athletes who are only on
// a roster. There is no sign-in history, so this is not "activated".

export type CampaignRow = {
  campaign_slug: string;
  organization_id: string | null;
  is_demo: boolean | null;
  archived: boolean | null;
  season_completed_at: string | null;
  successor_campaign_slug: string | null;
};
export type AthleteRow = { id: string; campaign_slug: string; previous_season_athlete_id: string | null };
export type MemberRow = { id: string; campaign_slug: string; role: string; account_id: string | null; athlete_id: string | null };
export type CoachRow = { id: string; campaign_slug: string; role: string; account_id: string | null; email: string | null };
export type StaffInvitationRow = { campaign_slug: string; role: string; accepted_at: string | null; revoked_at: string | null; expires_at: string | null };
export type AccessRequestRow = { campaign_slug: string; status: string };
export type CoachInviteTokenRow = { coach_id: string; used_at: string | null; expires_at: string | null };

export type Exclusions = { organizationIds: readonly string[]; campaignSlugs: readonly string[] };

export const ROLES = ["athlete", "head_coach", "assistant_coach", "parent", "booster"] as const;
export type Role = (typeof ROLES)[number];
export const STATUSES = ["account_linked", "team_login_only", "roster_only"] as const;
export type Status = (typeof STATUSES)[number];

export type PeopleCounts = {
  total: number;
  byRole: Record<Role, number>;
  /** Records whose role isn't one of ROLES (counted in total, not by role). */
  otherRole: number;
  multipleRoles: number;
  byStatus: Record<Status, number>;
};

export type PeopleStats = {
  allTime: PeopleCounts;
  current: PeopleCounts;
  teamSeasons: { included: number; current: number; demo: number; excludedTest: number };
  pending: {
    staffInvitations: number;
    parentRequests: number;
    athleteRequests: number;
    coachLinkInvitations: number;
  };
  /** Team records whose team-season no longer exists (not counted). */
  orphanRecords: number;
};

export type PeopleInput = {
  campaigns: readonly CampaignRow[];
  athletes: readonly AthleteRow[];
  members: readonly MemberRow[];
  coaches: readonly CoachRow[];
  staffInvitations: readonly StaffInvitationRow[];
  parentRequests: readonly AccessRequestRow[];
  athleteRequests: readonly AccessRequestRow[];
  coachInviteTokens: readonly CoachInviteTokenRow[];
  exclusions: Exclusions;
  now: Date;
};

/** The existing Complete Season rule (seasonState.ts isSeasonCompleted). */
export function isCompleted(c: Pick<CampaignRow, "season_completed_at" | "successor_campaign_slug">): boolean {
  return Boolean(c.season_completed_at) || Boolean(c.successor_campaign_slug);
}

/** Current season: neither archived nor completed. */
export function isCurrentSeason(c: CampaignRow): boolean {
  return !c.archived && !isCompleted(c);
}

export function isExcludedTest(c: Pick<CampaignRow, "campaign_slug" | "organization_id">, ex: Exclusions): boolean {
  return ex.campaignSlugs.includes(c.campaign_slug) || (c.organization_id !== null && ex.organizationIds.includes(c.organization_id));
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

function roleOf(raw: string): Role | null {
  return (ROLES as readonly string[]).includes(raw) ? (raw as Role) : null;
}

class UnionFind {
  private parent = new Map<string, string>();
  add(x: string) { if (!this.parent.has(x)) this.parent.set(x, x); }
  find(x: string): string {
    this.add(x);
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = x;
    while (c !== r) { const n = this.parent.get(c)!; this.parent.set(c, r); c = n; }
    return r;
  }
  union(a: string, b: string) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.parent.set(rb, ra); }
}

type Rec = { node: string; slug: string; role: Role | null; kind: "roster" | "login"; linked: boolean };

function emptyCounts(): PeopleCounts {
  return {
    total: 0,
    byRole: Object.fromEntries(ROLES.map(r => [r, 0])) as Record<Role, number>,
    otherRole: 0,
    multipleRoles: 0,
    byStatus: Object.fromEntries(STATUSES.map(s => [s, 0])) as Record<Status, number>,
  };
}

export function computePeopleStats(input: PeopleInput): PeopleStats {
  const { exclusions, now } = input;
  const bySlug = new Map(input.campaigns.map(c => [c.campaign_slug, c]));
  const included = new Set<string>();
  const current = new Set<string>();
  let demo = 0, excludedTest = 0;
  for (const c of input.campaigns) {
    if (c.is_demo) { demo++; continue; }
    if (isExcludedTest(c, exclusions)) { excludedTest++; continue; }
    included.add(c.campaign_slug);
    if (isCurrentSeason(c)) current.add(c.campaign_slug);
  }

  const uf = new UnionFind();
  const recs: Rec[] = [];
  let orphanRecords = 0;
  const keep = (slug: string) => {
    if (included.has(slug)) return true;
    if (!bySlug.has(slug)) orphanRecords++;
    return false;
  };

  const athleteIds = new Set<string>();
  for (const a of input.athletes) {
    if (!keep(a.campaign_slug)) continue;
    athleteIds.add(a.id);
    const node = `ath:${a.id}`;
    uf.add(node);
    recs.push({ node, slug: a.campaign_slug, role: "athlete", kind: "roster", linked: false });
  }
  // Season carry-over: only between roster rows that are both counted.
  for (const a of input.athletes) {
    if (a.previous_season_athlete_id && athleteIds.has(a.id) && athleteIds.has(a.previous_season_athlete_id)) {
      uf.union(`ath:${a.id}`, `ath:${a.previous_season_athlete_id}`);
    }
  }

  for (const m of input.members) {
    if (!keep(m.campaign_slug)) continue;
    const node = `mem:${m.id}`;
    uf.add(node);
    if (m.account_id) uf.union(node, `acct:${m.account_id}`);
    if (m.role === "athlete" && m.athlete_id && athleteIds.has(m.athlete_id)) uf.union(node, `ath:${m.athlete_id}`);
    recs.push({ node, slug: m.campaign_slug, role: roleOf(m.role), kind: "login", linked: Boolean(m.account_id) });
  }

  for (const c of input.coaches) {
    if (!keep(c.campaign_slug)) continue;
    const node = `coach:${c.id}`;
    uf.add(node);
    if (c.account_id) uf.union(node, `acct:${c.account_id}`);
    const email = normalizeEmail(c.email);
    if (email) uf.union(node, `cemail:${email}`);
    recs.push({ node, slug: c.campaign_slug, role: roleOf(c.role), kind: "login", linked: Boolean(c.account_id) });
  }

  // Per person: their records, all-time evidence for status.
  type Person = { recs: Rec[]; linked: boolean; hasLogin: boolean };
  const people = new Map<string, Person>();
  for (const r of recs) {
    const root = uf.find(r.node);
    const p = people.get(root) ?? { recs: [], linked: false, hasLogin: false };
    p.recs.push(r);
    if (r.linked) p.linked = true;
    if (r.kind === "login") p.hasLogin = true;
    people.set(root, p);
  }

  const allTime = emptyCounts();
  const cur = emptyCounts();
  const tally = (counts: PeopleCounts, p: Person, rs: Rec[]) => {
    counts.total++;
    const roles = new Set(rs.map(r => r.role).filter((r): r is Role => r !== null));
    for (const role of roles) counts.byRole[role]++;
    if (roles.size === 0) counts.otherRole++;
    if (roles.size > 1) counts.multipleRoles++;
    counts.byStatus[p.linked ? "account_linked" : p.hasLogin ? "team_login_only" : "roster_only"]++;
  };
  for (const p of people.values()) {
    tally(allTime, p, p.recs);
    const inCurrent = p.recs.filter(r => current.has(r.slug));
    if (inCurrent.length) tally(cur, p, inCurrent);
  }

  const t = now.getTime();
  const open = (expires: string | null) => !expires || new Date(expires).getTime() > t;
  const coachSlug = new Map(input.coaches.map(c => [c.id, c.campaign_slug]));
  return {
    allTime,
    current: cur,
    teamSeasons: { included: included.size, current: current.size, demo, excludedTest },
    pending: {
      staffInvitations: input.staffInvitations.filter(i => included.has(i.campaign_slug) && !i.accepted_at && !i.revoked_at && open(i.expires_at)).length,
      parentRequests: input.parentRequests.filter(r => included.has(r.campaign_slug) && r.status === "pending").length,
      athleteRequests: input.athleteRequests.filter(r => included.has(r.campaign_slug) && r.status === "pending").length,
      coachLinkInvitations: input.coachInviteTokens.filter(k => !k.used_at && open(k.expires_at) && included.has(coachSlug.get(k.coach_id) ?? "")).length,
    },
    orphanRecords,
  };
}
