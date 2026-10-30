import { restInsert, restList, restUpdate } from "./_client";
import { likeExact, type ConsentRecord, type ExistingContact, type PreviewLeadStore } from "@/lib/marketing/previewLead";

// CRM storage for fundraising-preview leads (see lib/marketing/previewLead.ts
// for the rules). Writes go straight to coach_crm_contacts /
// coach_crm_activities with exactly the fields listed here — deliberately
// NOT through crm.ts's createContact/createActivity, which default a new
// contact's state to "AZ" and stamp last_contacted_at on every note; a
// website visitor unlocking a preview is neither.
//
// The marketing_consent* columns come from
// supabase/migrations/phase_m1_crm_marketing_consent.sql. The route refuses
// to run (previewLeadReadiness) until MARKETING_PREVIEW_LEAD_GATE=on, which
// is only set after that migration has been applied to the environment.

export const previewLeadStore: PreviewLeadStore = {
  async findContactByEmail(normalizedEmail: string): Promise<ExistingContact | null> {
    const rows = await restList<ExistingContact>(
      `coach_crm_contacts?email=ilike.${encodeURIComponent(likeExact(normalizedEmail))}&select=id,marketing_consent&order=created_at.asc&limit=1`,
    );
    return rows[0] ?? null;
  },

  async createContact({ name, email, source, consent }) {
    const rows = await restInsert<{ id: string }>("coach_crm_contacts", {
      name,
      email,
      state: null,
      status: "prospect",
      source,
      marketing_consent: consent !== null,
      marketing_consent_at: consent?.at ?? null,
      marketing_consent_text: consent?.text ?? null,
      marketing_consent_source: consent?.source ?? null,
    });
    return { id: rows[0].id };
  },

  async addActivity(contactId: string, title: string, body: string) {
    await restInsert("coach_crm_activities", { contact_id: contactId, activity_type: "note", title, body });
  },

  async recordConsent(contactId: string, consent: ConsentRecord) {
    await restUpdate(`coach_crm_contacts?id=eq.${encodeURIComponent(contactId)}`, {
      marketing_consent: true,
      marketing_consent_at: consent.at,
      marketing_consent_text: consent.text,
      marketing_consent_source: consent.source,
      updated_at: new Date().toISOString(),
    });
  },
};
