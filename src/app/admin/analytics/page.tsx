import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { redirect } from "next/navigation";
import AnalyticsView, { type AnalyticsData } from "./AnalyticsView";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function countRows(table: string): Promise<number> {
  const res = await fetch(`${BASE}/rest/v1/${table}?select=id`, {
    headers: { ...h(), Prefer: "count=exact" },
    cache: "no-store",
  });
  const cr = res.headers.get("content-range") ?? "";
  return parseInt(cr.split("/")[1] ?? "0") || 0;
}

export default async function AnalyticsPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const [
    campaignsRes, donationsRes, athletesRes,
    membersRes, coachesRes, contactsRes,
    goalsRes, msgCount,
  ] = await Promise.all([
    fetch(`${BASE}/rest/v1/campaign_settings?select=campaign_slug,school_name,sport_name,season,goal_cents,deadline,archived,primary_color`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/donations?select=campaign_slug,athlete_id,athlete_name,amount_cents,created_at&order=created_at.desc`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/athletes?select=id,campaign_slug,name`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/team_members?select=campaign_slug,role,athlete_id,account_id`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/team_coaches?select=campaign_slug,role,account_id`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/fundraising_contacts?select=campaign_slug,athlete_id`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/fundraising_contact_goals?select=campaign_slug,athlete_id,goal`, { headers: h(), cache: "no-store" }),
    countRows("messages"),
  ]);

  type RawCampaign = { campaign_slug: string; school_name: string; sport_name: string; season: string; goal_cents: number; deadline: string; archived: boolean; primary_color: string };
  type RawDonation = { campaign_slug: string; athlete_id: string | null; athlete_name: string | null; amount_cents: number; created_at: string };
  type RawAthlete  = { id: string; campaign_slug: string; name: string };
  type RawMember   = { campaign_slug: string; role: string; athlete_id: string | null; account_id: string | null };
  type RawCoach    = { campaign_slug: string; role: string; account_id: string | null };
  type RawContact  = { campaign_slug: string; athlete_id: string | null };
  type RawGoal     = { campaign_slug: string; athlete_id: string | null; goal: number };

  const campaigns: RawCampaign[] = campaignsRes.ok ? await campaignsRes.json() : [];
  const donations: RawDonation[] = donationsRes.ok ? await donationsRes.json() : [];
  const athletes:  RawAthlete[]  = athletesRes.ok  ? await athletesRes.json()  : [];
  const members:   RawMember[]   = membersRes.ok   ? await membersRes.json()   : [];
  const coaches:   RawCoach[]    = coachesRes.ok   ? await coachesRes.json()   : [];
  const contacts:  RawContact[]  = contactsRes.ok  ? await contactsRes.json()  : [];
  const goals:     RawGoal[]     = goalsRes.ok     ? await goalsRes.json()     : [];

  // ── Per-campaign lookup maps ──────────────────────────────────────────────

  const donationsByCamp:  Record<string, RawDonation[]> = {};
  const athletesByCamp:   Record<string, RawAthlete[]>  = {};
  const membersByCamp:    Record<string, RawMember[]>   = {};
  const coachesByCamp:    Record<string, RawCoach[]>    = {};
  const contactsByCamp:   Record<string, number>         = {};
  const goalsByCamp:      Record<string, { team: number; perAthlete: Record<string, number> }> = {};

  for (const d of donations) {
    if (!donationsByCamp[d.campaign_slug]) donationsByCamp[d.campaign_slug] = [];
    donationsByCamp[d.campaign_slug].push(d);
  }
  for (const a of athletes) {
    if (!athletesByCamp[a.campaign_slug]) athletesByCamp[a.campaign_slug] = [];
    athletesByCamp[a.campaign_slug].push(a);
  }
  for (const m of members) {
    if (!membersByCamp[m.campaign_slug]) membersByCamp[m.campaign_slug] = [];
    membersByCamp[m.campaign_slug].push(m);
  }
  for (const c of coaches) {
    if (!coachesByCamp[c.campaign_slug]) coachesByCamp[c.campaign_slug] = [];
    coachesByCamp[c.campaign_slug].push(c);
  }
  for (const c of contacts) {
    contactsByCamp[c.campaign_slug] = (contactsByCamp[c.campaign_slug] ?? 0) + 1;
  }
  for (const g of goals) {
    if (!goalsByCamp[g.campaign_slug]) goalsByCamp[g.campaign_slug] = { team: 10, perAthlete: {} };
    if (g.athlete_id === null) goalsByCamp[g.campaign_slug].team = g.goal;
    else goalsByCamp[g.campaign_slug].perAthlete[g.athlete_id] = g.goal;
  }

  // ── Top athletes by raised ────────────────────────────────────────────────

  const athleteRaised: Record<string, { name: string; campaign: string; cents: number }> = {};
  for (const d of donations) {
    if (!d.athlete_id) continue;
    if (!athleteRaised[d.athlete_id]) athleteRaised[d.athlete_id] = { name: d.athlete_name ?? "—", campaign: d.campaign_slug, cents: 0 };
    athleteRaised[d.athlete_id].cents += d.amount_cents ?? 0;
  }
  const topAthletes = Object.entries(athleteRaised)
    .sort((a, b) => b[1].cents - a[1].cents)
    .slice(0, 10)
    .map(([id, v]) => ({ id, name: v.name, campaign: v.campaign, raisedCents: v.cents }));

  // ── Per-campaign enrichment ───────────────────────────────────────────────

  const campaignRows = campaigns.map(c => {
    const slug         = c.campaign_slug;
    const campDons     = donationsByCamp[slug] ?? [];
    const campAthletes = athletesByCamp[slug]  ?? [];
    const campMembers  = membersByCamp[slug]   ?? [];
    const campGoals    = goalsByCamp[slug]      ?? { team: 10, perAthlete: {} };

    const raisedCents    = campDons.reduce((s, d) => s + (d.amount_cents ?? 0), 0);
    const donationCount  = campDons.length;
    const athleteCount   = campAthletes.length;
    const athleteMembers = campMembers.filter(m => m.role === "athlete");
    const parentMembers  = campMembers.filter(m => m.role === "parent");
    const athleteAccts   = athleteMembers.filter(m => m.account_id != null).length;
    const parentLinks    = parentMembers.length;
    const memberCount    = campMembers.length;
    const contactsCollected = contactsByCamp[slug] ?? 0;

    // Total expected contacts = sum of each athlete's goal
    const totalContactGoal = campAthletes.reduce((s, a) => {
      return s + (campGoals.perAthlete[a.id] ?? campGoals.team);
    }, 0);

    const pctToGoal          = c.goal_cents > 0 ? Math.round((raisedCents / c.goal_cents) * 100) : 0;
    const adoptionPct        = athleteCount > 0 ? Math.round((athleteAccts / athleteCount) * 100) : 0;
    const contactCompletionPct = totalContactGoal > 0 ? Math.round((contactsCollected / totalContactGoal) * 100) : 0;
    const avgDonationCents   = donationCount > 0 ? Math.round(raisedCents / donationCount) : 0;

    return {
      slug,
      name:                c.school_name,
      sport:               c.sport_name,
      season:              c.season,
      archived:            c.archived,
      primaryColor:        c.primary_color,
      goalCents:           c.goal_cents ?? 0,
      deadline:            c.deadline ?? "",
      raisedCents,
      donationCount,
      athleteCount,
      memberCount,
      athleteAccounts:     athleteAccts,
      parentLinks,
      contactsCollected,
      totalContactGoal,
      pctToGoal,
      adoptionPct,
      contactCompletionPct,
      avgDonationCents,
    };
  });

  // Sort by raised desc
  const campaignsSorted = [...campaignRows].sort((a, b) => b.raisedCents - a.raisedCents);

  // ── Platform-wide KPIs ────────────────────────────────────────────────────

  const totalRaisedCents    = donations.reduce((s, d) => s + (d.amount_cents ?? 0), 0);
  const totalDonations      = donations.length;
  const avgDonationCents    = totalDonations > 0 ? Math.round(totalRaisedCents / totalDonations) : 0;
  const activeCampaigns     = campaigns.filter(c => !c.archived).length;
  const totalAthletes       = athletes.length;
  const memberAccounts      = members.filter(m => m.account_id != null).length;
  const coachAccounts       = coaches.filter(c => c.account_id != null).length;
  const totalAccounts       = memberAccounts + coachAccounts;
  const contactsCollected   = contacts.length;

  // Adoption
  const athleteMembers      = members.filter(m => m.role === "athlete");
  const athleteAccounts     = athleteMembers.filter(m => m.account_id != null).length;
  const parentLinksTotal    = members.filter(m => m.role === "parent").length;

  const accountsByRole: Record<string, number> = {};
  for (const m of members) accountsByRole[m.role] = (accountsByRole[m.role] ?? 0) + (m.account_id ? 1 : 0);
  for (const c of coaches)  accountsByRole[c.role] = (accountsByRole[c.role] ?? 0) + (c.account_id ? 1 : 0);

  // Contact analytics
  const contactsByAthlete: Record<string, number> = {};
  for (const c of contacts) {
    if (c.athlete_id) contactsByAthlete[c.athlete_id] = (contactsByAthlete[c.athlete_id] ?? 0) + 1;
  }
  const goalsMap: Record<string, number> = {};
  const teamGoals: Record<string, number> = {};
  for (const g of goals) {
    if (g.athlete_id === null) teamGoals[g.campaign_slug] = g.goal;
    else goalsMap[g.athlete_id] = g.goal;
  }
  const athletesWithZeroContacts = athletes.filter(a => !contactsByAthlete[a.id]).length;
  const athletesAtGoal = athletes.filter(a => {
    const goal = goalsMap[a.id] ?? teamGoals[a.campaign_slug] ?? 10;
    return (contactsByAthlete[a.id] ?? 0) >= goal;
  }).length;

  // Recent donations (top 10)
  const recentDonations = donations.slice(0, 10).map(d => ({
    campaign: d.campaign_slug,
    athlete:  d.athlete_name ?? "Anonymous",
    cents:    d.amount_cents ?? 0,
    date:     d.created_at?.slice(0, 10) ?? "",
  }));

  const data: AnalyticsData = {
    // KPIs
    totalRaisedCents,
    totalDonations,
    avgDonationCents,
    activeCampaigns,
    totalCampaigns: campaigns.length,
    totalAthletes,
    totalAccounts,
    contactsCollected,
    messagesSent: msgCount,
    // campaigns
    campaigns: campaignsSorted,
    // fundraising
    topAthletes,
    recentDonations,
    // contacts
    athletesWithZeroContacts,
    athletesAtGoal,
    // adoption
    totalAthleteMembers: athleteMembers.length,
    athleteAccounts,
    parentLinksTotal,
    coachAccounts,
    accountsByRole,
  };

  return <AnalyticsView data={data} />;
}
