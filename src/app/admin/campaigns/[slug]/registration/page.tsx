import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { redirect, notFound } from "next/navigation";
import RegistrationView from "./RegistrationView";
import type { AthleteRegistration, RegistrationSummary } from "@/app/api/admin/campaigns/[slug]/registration/route";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

type RouteCtx = { params: Promise<{ slug: string }> };

export default async function RegistrationPage({ params }: RouteCtx) {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const { slug } = await params;
  const enc = encodeURIComponent(slug);

  const [settingsRes, athletesRes, membersRes, contactsRes, goalsRes, donationsRes] = await Promise.all([
    fetch(`${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${enc}&select=campaign_slug,school_name,sport_name,season&limit=1`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/athletes?campaign_slug=eq.${enc}&select=id,name,event,class_year,jersey_number,grad_year,profile_photo&order=name.asc`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/team_members?campaign_slug=eq.${enc}&select=id,role,name,athlete_id,account_id`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/fundraising_contacts?campaign_slug=eq.${enc}&select=athlete_id`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/fundraising_contact_goals?campaign_slug=eq.${enc}&select=athlete_id,goal`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/donations?campaign_slug=eq.${enc}&select=athlete_id,amount_cents`, { headers: h(), cache: "no-store" }),
  ]);

  const settingsRows = settingsRes.ok ? await settingsRes.json() : [];
  if (!settingsRows.length) notFound();
  const settings = settingsRows[0];

  type RawAthlete  = { id: string; name: string; event: string; class_year: string | null; jersey_number: number | null; grad_year: number | null; profile_photo: string | null };
  type RawMember   = { id: string; role: string; name: string; athlete_id: string | null; account_id: string | null };
  type RawContact  = { athlete_id: string | null };
  type RawGoal     = { athlete_id: string | null; goal: number };
  type RawDonation = { athlete_id: string | null; amount_cents: number };

  const athletes:  RawAthlete[]  = athletesRes.ok  ? await athletesRes.json()  : [];
  const members:   RawMember[]   = membersRes.ok   ? await membersRes.json()   : [];
  const contacts:  RawContact[]  = contactsRes.ok  ? await contactsRes.json()  : [];
  const goals:     RawGoal[]     = goalsRes.ok     ? await goalsRes.json()     : [];
  const donations: RawDonation[] = donationsRes.ok ? await donationsRes.json() : [];

  const teamDefaultGoal = goals.find(g => g.athlete_id === null)?.goal ?? 10;

  const perAthleteGoal: Record<string, number> = {};
  for (const g of goals) {
    if (g.athlete_id !== null) perAthleteGoal[g.athlete_id] = g.goal;
  }

  const contactCount: Record<string, number> = {};
  for (const c of contacts) {
    if (c.athlete_id) contactCount[c.athlete_id] = (contactCount[c.athlete_id] ?? 0) + 1;
  }

  const donationTotal: Record<string, number> = {};
  for (const d of donations) {
    if (d.athlete_id) donationTotal[d.athlete_id] = (donationTotal[d.athlete_id] ?? 0) + (d.amount_cents ?? 0);
  }

  const athleteMembers: Record<string, RawMember[]> = {};
  for (const m of members) {
    if (m.athlete_id) {
      if (!athleteMembers[m.athlete_id]) athleteMembers[m.athlete_id] = [];
      athleteMembers[m.athlete_id].push(m);
    }
  }

  const rows: AthleteRegistration[] = athletes.map(a => {
    const linked        = athleteMembers[a.id] ?? [];
    const athleteMember = linked.find(m => m.role === "athlete");
    const parentMembers = linked.filter(m => m.role === "parent");

    const athleteAccountCreated = athleteMember?.account_id != null;
    const parentLinked          = parentMembers.length > 0;
    const parentAccountCreated  = parentMembers.some(m => m.account_id != null);
    const profilePhotoUploaded  = !!(a.profile_photo);
    const contactsEntered       = contactCount[a.id] ?? 0;
    const contactGoal           = perAthleteGoal[a.id] ?? teamDefaultGoal;
    const contactGoalMet        = contactsEntered >= contactGoal;
    const donationsCents        = donationTotal[a.id] ?? 0;

    const checks = [athleteAccountCreated, parentLinked, profilePhotoUploaded, contactGoalMet];
    const done   = checks.filter(Boolean).length;
    const status: "complete" | "in_progress" | "not_started" =
      done === checks.length ? "complete" :
      done > 0              ? "in_progress" :
      "not_started";

    return {
      athlete_id: a.id, name: a.name, event: a.event, class_year: a.class_year,
      jersey_number: a.jersey_number, grad_year: a.grad_year, profile_photo: a.profile_photo,
      athlete_account_created: athleteAccountCreated,
      parent_linked: parentLinked,
      parent_account_created: parentAccountCreated,
      profile_photo_uploaded: profilePhotoUploaded,
      contacts_entered: contactsEntered,
      contact_goal: contactGoal,
      contact_goal_met: contactGoalMet,
      donations_cents: donationsCents,
      status,
    };
  });

  const summary: RegistrationSummary = {
    total_athletes:           athletes.length,
    athlete_accounts_created: rows.filter(r => r.athlete_account_created).length,
    parents_linked:           rows.filter(r => r.parent_linked).length,
    photos_uploaded:          rows.filter(r => r.profile_photo_uploaded).length,
    zero_contacts:            rows.filter(r => r.contacts_entered === 0).length,
    contact_goal_met:         rows.filter(r => r.contact_goal_met).length,
    has_donations:            rows.filter(r => r.donations_cents > 0).length,
    complete:                 rows.filter(r => r.status === "complete").length,
    in_progress:              rows.filter(r => r.status === "in_progress").length,
    not_started:              rows.filter(r => r.status === "not_started").length,
    team_default_goal:        teamDefaultGoal,
  };

  const campaignLabel = [settings.school_name, settings.sport_name, settings.season].filter(Boolean).join(" · ");

  return (
    <RegistrationView
      slug={slug}
      campaignLabel={campaignLabel}
      athletes={rows}
      summary={summary}
    />
  );
}
