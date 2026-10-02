// Cheap existing-roster lookup for the roster-import review step — one
// athletes read plus two lightweight link/history reads, no new tables, no
// donor/contact PII (only athlete_id presence is used, never contact details).
import { restList } from "../_client.ts";
import type { ExistingAthleteInfo } from "./rosterCandidates.ts";

type AthleteRow = { id: string; name: string; class_year: string | null; event: string | null };
type MemberRow  = { athlete_id: string };
type ContactRow = { athlete_id: string | null };

export async function getExistingAthleteInfo(campaignSlug: string): Promise<ExistingAthleteInfo[]> {
  const slug = encodeURIComponent(campaignSlug);
  const [athletes, members, contacts] = await Promise.all([
    restList<AthleteRow>(`athletes?campaign_slug=eq.${slug}&select=id,name,class_year,event`),
    restList<MemberRow>(`team_members?campaign_slug=eq.${slug}&role=eq.athlete&athlete_id=not.is.null&select=athlete_id`),
    restList<ContactRow>(`fundraising_contacts?campaign_slug=eq.${slug}&select=athlete_id`),
  ]);

  const linkedIds  = new Set(members.map(m => m.athlete_id));
  const historyIds = new Set(contacts.map(c => c.athlete_id).filter((id): id is string => !!id));

  return athletes.map(a => ({
    id:                    a.id,
    name:                  a.name,
    class_year:            a.class_year,
    event:                 a.event,
    linked:                linkedIds.has(a.id),
    hasFundraisingHistory: historyIds.has(a.id),
  }));
}
