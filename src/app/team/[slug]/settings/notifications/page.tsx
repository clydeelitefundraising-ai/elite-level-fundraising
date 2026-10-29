import { redirect } from "next/navigation";
import { getTeamActor } from "@/lib/permissions.server";
import { getAccountSession } from "@/lib/accountSession";
import SettingsScreen from "../SettingsScreen";
import NotificationPreferencesSection from "../NotificationPreferencesSection";

// Settings → Notifications, for every authenticated role (approved: Head and
// Assistant Coach, Athlete, Parent, Booster, Platform Admin). Preferences are
// the signed-in person's own: /api/push/preferences reads and writes only
// the push_preferences row of the account in the elf_session cookie — no
// team or account id is ever sent — and push devices register through the
// same account session. A legacy team-cookie-only session has no account
// (and so no push delivery) — it gets the existing activation path instead
// of a load error. Delivery logic and defaults are unchanged.
export default async function NotificationSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") redirect("/coach-login");
  const account = await getAccountSession();

  return (
    <SettingsScreen slug={slug} title="Notifications" testId="settings-screen-notifications">
      {account ? (
        <NotificationPreferencesSection showHeading={false} />
      ) : (
        <div data-testid="notifications-activate" style={{ background: "var(--surface-light)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-app)", padding: "1rem" }}>
          <p style={{ margin: "0 0 .75rem", fontSize: ".82rem", color: "var(--text-secondary-app)", lineHeight: 1.5 }}>
            Notification preferences belong to your ELF account. Activate your account to choose which notifications you receive.
          </p>
          <a href={`/team/${slug}/activate-account`} className="elf-focus-ring" style={{ display: "inline-flex", alignItems: "center", minHeight: 40, padding: ".55rem 1rem", borderRadius: 9, background: "var(--team-primary)", color: "var(--team-primary-foreground)", fontWeight: 700, fontSize: ".82rem", textDecoration: "none" }}>
            Activate Account
          </a>
        </div>
      )}
    </SettingsScreen>
  );
}
