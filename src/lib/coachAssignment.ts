// Shared logic for assigning an EXISTING elf_accounts holder as head coach of
// a newly-created campaign, instead of always minting a brand-new account.
// Used by the admin "New Campaign" wizard's Step 5 "Select Existing Coach"
// mode. Kept separate from campaignCreate.ts's "create a new coach" path —
// the two flows share almost no logic (no password, no welcome email, no
// new elf_accounts row here).

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export type CoachAccount = { id: string; name: string; email: string };

export type CoachTeamContext = {
  campaign_slug: string;
  role:          string;
  school_name:   string;
  sport_name:    string;
  season:        string;
};

export type CoachSearchResult = CoachAccount & { teams: CoachTeamContext[] };

// Only true if the account already holds at least one team_coaches row
// anywhere — i.e. it's "coach-capable" today. Prevents the assignment path
// (and the search results feeding it) from surfacing arbitrary athlete/
// parent/donor accounts that have never been a coach.
export async function isCoachCapableAccount(accountId: string): Promise<boolean> {
  const res = await fetch(
    `${BASE}/rest/v1/team_coaches?account_id=eq.${encodeURIComponent(accountId)}&select=id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

export async function findAccountByEmail(email: string): Promise<CoachAccount | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const res = await fetch(
    `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(normalized)}&select=id,name,email&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? (rows[0] as CoachAccount) : null;
}

async function getTeamsForAccounts(accountIds: string[]): Promise<Map<string, CoachTeamContext[]>> {
  const byAccount = new Map<string, CoachTeamContext[]>();
  if (accountIds.length === 0) return byAccount;

  const idsCsv = accountIds.map(id => `"${id}"`).join(",");
  const tcRes = await fetch(
    `${BASE}/rest/v1/team_coaches?account_id=in.(${idsCsv})&select=account_id,campaign_slug,role`,
    { headers: h(), cache: "no-store" },
  );
  const tcRows: Array<{ account_id: string; campaign_slug: string; role: string }> = tcRes.ok ? await tcRes.json() : [];
  if (tcRows.length === 0) return byAccount;

  const slugs = [...new Set(tcRows.map(r => r.campaign_slug))];
  const slugsCsv = slugs.map(s => `"${s}"`).join(",");
  const csRes = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=in.(${slugsCsv})&select=campaign_slug,school_name,sport_name,season`,
    { headers: h(), cache: "no-store" },
  );
  const csRows: Array<{ campaign_slug: string; school_name: string; sport_name: string; season: string }> = csRes.ok ? await csRes.json() : [];
  const csBySlug = new Map(csRows.map(c => [c.campaign_slug, c]));

  for (const row of tcRows) {
    const settings = csBySlug.get(row.campaign_slug);
    const entry: CoachTeamContext = {
      campaign_slug: row.campaign_slug,
      role:          row.role,
      school_name:   settings?.school_name ?? "",
      sport_name:    settings?.sport_name  ?? "",
      season:        settings?.season      ?? "",
    };
    const list = byAccount.get(row.account_id) ?? [];
    list.push(entry);
    byAccount.set(row.account_id, list);
  }
  return byAccount;
}

// Direct lookup by account id — used only to re-hydrate a preselected
// account (e.g. after a duplicate-email rejection offers to switch modes)
// with its team context. Not exposed as a general "fetch any account by id"
// capability beyond what the coach-search route already gates behind admin
// auth. Applies the exact same coach-capability filter as searchCoachAccounts
// — a non-coach account (pure athlete/parent/donor) must never be returned
// here either, so the picker never briefly shows an ineligible account.
// This is UI-layer politeness only; the real backstop remains
// assignExistingCoachToCampaign's own isCoachCapableAccount check at launch.
export async function getCoachById(accountId: string): Promise<CoachSearchResult | null> {
  const res = await fetch(
    `${BASE}/rest/v1/elf_accounts?id=eq.${encodeURIComponent(accountId)}&select=id,name,email&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const rows: CoachAccount[] = res.ok ? await res.json() : [];
  if (rows.length === 0) return null;

  const teamsByAccount = await getTeamsForAccounts([accountId]);
  const teams = teamsByAccount.get(accountId) ?? [];
  if (teams.length === 0) return null; // not coach-capable — same rule as search

  return { ...rows[0], teams };
}

// Server-side search across coach-capable accounts only — never loads every
// account into the browser. Matches by name/email directly, or by the
// school/sport of a team the account already coaches. No schema/migration
// added solely for this — plain REST queries composed here, acceptable at
// this project's current scale (see report for the future-indexing note).
export async function searchCoachAccounts(query: string, limit = 8): Promise<CoachSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `*${q}*`;

  // Path 1: direct name/email match on the account itself.
  const directRes = await fetch(
    `${BASE}/rest/v1/elf_accounts?or=(name.ilike.${encodeURIComponent(pattern)},email.ilike.${encodeURIComponent(pattern)})&select=id,name,email&limit=20`,
    { headers: h(), cache: "no-store" },
  );
  const directRows: CoachAccount[] = directRes.ok ? await directRes.json() : [];

  // Path 2: match by the school/sport of a team the account already coaches.
  const campaignRes = await fetch(
    `${BASE}/rest/v1/campaign_settings?or=(school_name.ilike.${encodeURIComponent(pattern)},sport_name.ilike.${encodeURIComponent(pattern)})&select=campaign_slug&limit=25`,
    { headers: h(), cache: "no-store" },
  );
  const campaignRows: Array<{ campaign_slug: string }> = campaignRes.ok ? await campaignRes.json() : [];
  let contextAccountIds: string[] = [];
  if (campaignRows.length > 0) {
    const slugsCsv = campaignRows.map(c => `"${c.campaign_slug}"`).join(",");
    const tcRes = await fetch(
      `${BASE}/rest/v1/team_coaches?campaign_slug=in.(${slugsCsv})&account_id=not.is.null&select=account_id&limit=50`,
      { headers: h(), cache: "no-store" },
    );
    const tcRows: Array<{ account_id: string }> = tcRes.ok ? await tcRes.json() : [];
    contextAccountIds = [...new Set(tcRows.map(r => r.account_id))];
  }

  const candidateIds = [...new Set([...directRows.map(a => a.id), ...contextAccountIds])];
  if (candidateIds.length === 0) return [];

  // Need full account records for any ids found only via Path 2.
  const missingIds = candidateIds.filter(id => !directRows.some(a => a.id === id));
  let extraAccounts: CoachAccount[] = [];
  if (missingIds.length > 0) {
    const idsCsv = missingIds.map(id => `"${id}"`).join(",");
    const extraRes = await fetch(
      `${BASE}/rest/v1/elf_accounts?id=in.(${idsCsv})&select=id,name,email`,
      { headers: h(), cache: "no-store" },
    );
    extraAccounts = extraRes.ok ? await extraRes.json() : [];
  }
  const allAccountsById = new Map<string, CoachAccount>(
    [...directRows, ...extraAccounts].map(a => [a.id, a]),
  );

  const teamsByAccount = await getTeamsForAccounts(candidateIds);

  const results: CoachSearchResult[] = [];
  for (const id of candidateIds) {
    const account = allAccountsById.get(id);
    const teams = teamsByAccount.get(id) ?? [];
    if (!account || teams.length === 0) continue; // coach-capable only
    results.push({ ...account, teams });
  }

  return results.slice(0, limit);
}

export type CoachEligibilityResult =
  | { ok: true;  name: string; email: string }
  | { ok: false; error: string; status: number };

// Deterministic, read-only eligibility check — no writes. Callable as a
// pre-flight before any campaign-related rows are created (so an ineligible
// account can never leave a partially-created campaign behind), and reused
// internally by assignExistingCoachToCampaign so the two checks can never
// drift out of sync.
export async function checkExistingCoachEligibility(accountId: string): Promise<CoachEligibilityResult> {
  const account = await fetch(
    `${BASE}/rest/v1/elf_accounts?id=eq.${encodeURIComponent(accountId)}&select=id,name,email&limit=1`,
    { headers: h(), cache: "no-store" },
  ).then(r => (r.ok ? r.json() : []));

  if (!Array.isArray(account) || account.length === 0) {
    return { ok: false, error: "Selected coach account was not found.", status: 400 };
  }
  const { name, email } = account[0] as CoachAccount;

  const capable = await isCoachCapableAccount(accountId);
  if (!capable) {
    return { ok: false, error: "This account is not currently a coach and can't be assigned this way.", status: 400 };
  }

  return { ok: true, name, email };
}

export type AssignExistingCoachResult =
  | { ok: true;  alreadyLinked: boolean; coachName: string; coachEmail: string }
  | { ok: false; error: string; status: number };

// Attaches an already-existing elf_accounts holder as head coach of `slug`.
// Never creates a second elf_accounts row, never touches the account's
// password, never sends a welcome/temp-password email. Idempotent: if the
// account is already linked to this campaign, returns success without
// inserting a duplicate row.
export async function assignExistingCoachToCampaign(
  slug: string,
  accountId: string,
): Promise<AssignExistingCoachResult> {
  const eligibility = await checkExistingCoachEligibility(accountId);
  if (!eligibility.ok) return eligibility;
  const { name, email } = eligibility;

  // Idempotency: if this exact (campaign, account) relationship already
  // exists — from a prior attempt, a double-click, or a browser retry —
  // reuse it instead of inserting a duplicate.
  const existingRes = await fetch(
    `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&account_id=eq.${encodeURIComponent(accountId)}&select=id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const existingRows = existingRes.ok ? await existingRes.json() : [];
  if (Array.isArray(existingRows) && existingRows.length > 0) {
    return { ok: true, alreadyLinked: true, coachName: name, coachEmail: email };
  }

  // password_hash/salt are vestigial once account_id is set (login resolves
  // entirely through elf_accounts/elf_session — see getActorForAccount) but
  // the columns are NOT NULL; "unused" is the existing convention for this
  // exact situation elsewhere in this codebase.
  const insertRes = await fetch(`${BASE}/rest/v1/team_coaches`, {
    method:  "POST",
    headers: h({ Prefer: "return=minimal" }),
    body:    JSON.stringify({
      campaign_slug: slug,
      name,
      email,
      role:          "head_coach",
      account_id:    accountId,
      password_hash: "unused",
      salt:          "unused",
    }),
  });

  if (!insertRes.ok) {
    const msg = await insertRes.text();
    // Race: another concurrent request created the same relationship first —
    // the new partial unique index (phase_a26) makes this a real, catchable
    // outcome rather than a silent duplicate.
    if (msg.includes("23505") || msg.includes("unique")) {
      return { ok: true, alreadyLinked: true, coachName: name, coachEmail: email };
    }
    return { ok: false, error: "Failed to assign the selected coach to this campaign.", status: 500 };
  }

  return { ok: true, alreadyLinked: false, coachName: name, coachEmail: email };
}
