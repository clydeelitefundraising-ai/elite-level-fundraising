import { getAdminAccess } from "@/lib/adminAccess";
import { redirect } from "next/navigation";
import { getContact } from "@/lib/platform/crm";
import NewCampaignWizard, { type CrmSeed } from "./NewCampaignWizard";
import PlatformAdminRequired from "../_components/PlatformAdminRequired";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ crm_contact_id?: string }>;
}) {
  const access = await getAdminAccess();
  if (!access) redirect("/admin");
  if (access.via !== "platform_admin") return <PlatformAdminRequired action="Creating a campaign" />;

  // Only an opaque id ever appears in the URL — never school/sport/coach name
  // or email. The wizard's seed values below come from an admin-authenticated
  // server-side lookup, not from anything the browser could have supplied.
  const { crm_contact_id } = await searchParams;
  let crmSeed: CrmSeed | null = null;
  if (crm_contact_id) {
    const contact = await getContact(crm_contact_id);
    if (contact) {
      crmSeed = {
        contactId:  contact.id,
        schoolName: contact.school_name ?? "",
        sportName:  contact.sport ?? "",
        coachName:  contact.name,
        coachEmail: contact.email ?? "",
      };
    }
  }

  // No defaults are loaded here: the wizard starts from neutral ELF values
  // and takes defaults only from the school the admin selects (formerly this
  // read the first organizations row — an arbitrary school).
  return <NewCampaignWizard crmSeed={crmSeed} />;
}
