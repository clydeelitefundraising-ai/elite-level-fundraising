import { redirect } from "next/navigation";
import { ChevronRight, UserRound } from "lucide-react";
import { getTeamActor } from "@/lib/permissions.server";
import { getAccountSession } from "@/lib/accountSession";
import SettingsScreen from "../SettingsScreen";
import AccountPrivacySection from "../AccountPrivacySection";

// Settings → Account & Privacy, for every authenticated role: a link to the
// existing Profile page (not duplicated here — shown only with an ELF
// account session, the same condition AccountMenu uses), then the existing
// Blocked Users / Delete Account controls, both modals unchanged.
export default async function AccountSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") redirect("/coach-login");
  const account = await getAccountSession();

  return (
    <SettingsScreen slug={slug} title="Account & Privacy" testId="settings-screen-account">
      {account && (
        <a
          href={`/team/${slug}/profile`}
          className="elf-focus-ring"
          data-testid="settings-profile-link"
          style={{ display: "flex", alignItems: "center", gap: ".6rem", minHeight: 48, padding: ".75rem .9rem", marginBottom: ".75rem", background: "var(--surface-light)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-app)", textDecoration: "none", color: "var(--text-primary-app)", fontSize: ".84rem", fontWeight: 600 }}
        >
          <UserRound size={16} aria-hidden="true" style={{ flexShrink: 0, color: "var(--text-muted-app)" }} />
          <span style={{ flex: 1 }}>My Profile</span>
          <ChevronRight size={15} aria-hidden="true" style={{ flexShrink: 0, color: "var(--text-muted-app)", opacity: .6 }} />
        </a>
      )}
      <AccountPrivacySection slug={slug} showHeading={false} />
    </SettingsScreen>
  );
}
