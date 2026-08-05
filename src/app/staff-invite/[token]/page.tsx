import { lookupInvitationByToken, findAccountByEmail, normalizeEmail } from "@/lib/staffInvite";
import { getCampaignSettings } from "@/lib/supabase";
import StaffInviteAcceptView from "./StaffInviteAcceptView";

export const dynamic = "force-dynamic";

export default async function StaffInviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await lookupInvitationByToken(token).catch(() => null);
  if (!invite) return <StaffInviteAcceptView status="invalid" token={token} />;
  if (invite.revoked_at) return <StaffInviteAcceptView status="revoked" token={token} />;
  if (invite.accepted_at) return <StaffInviteAcceptView status="used" token={token} />;
  if (new Date(invite.expires_at) < new Date()) return <StaffInviteAcceptView status="expired" token={token} />;

  const [settings, existingAccount] = await Promise.all([
    getCampaignSettings(invite.campaign_slug).catch(() => null),
    findAccountByEmail(normalizeEmail(invite.email)).catch(() => null),
  ]);
  const teamName = settings ? `${settings.school_name} ${settings.mascot} ${settings.sport_name}`.trim() : invite.campaign_slug;

  return (
    <StaffInviteAcceptView
      status="valid"
      token={token}
      inviteeName={invite.full_name}
      email={invite.email}
      role={invite.role}
      teamName={teamName}
      hasExistingAccount={!!existingAccount}
    />
  );
}
