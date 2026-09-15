"use client";

import AccountPrivacySection from "./AccountPrivacySection";
import IdentityAvatar from "./IdentityAvatar";

// General/account settings for every role that isn't a real coach
// (athlete, parent, booster, and a platform admin browsing this team's
// Settings page) — the previous behavior sent all of them to a
// "Coach Access Only" dead end, leaving no Settings page at all. This is
// deliberately NOT the coach SettingsView with sections hidden — it's a
// separate, much smaller view containing only what applies to every
// role, so no coach-only control is ever reachable by a non-coach.
export default function MemberSettingsView({
  slug,
  name,
  roleLabel,
  photoUrl,
}: {
  slug: string;
  name: string;
  roleLabel: string;
  photoUrl: string | null;
}) {
  return (
    <div style={{ animation: "elf-fadeUp .22s ease both", maxWidth: 700, margin: "0 auto" }}>
      <div style={{
        background: "var(--surface-light)",
        borderRadius: "var(--radius-lg)",
        padding: ".75rem 1rem",
        border: "1px solid var(--border-app)",
        marginBottom: ".75rem",
        display: "flex",
        alignItems: "center",
        gap: ".75rem",
      }}>
        <IdentityAvatar name={name} photoUrl={photoUrl} />
        <div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-primary-app)" }}>{name}</div>
          <div style={{ fontSize: ".72rem", color: "var(--text-muted-app)", marginTop: ".05rem" }}>{roleLabel}</div>
        </div>
      </div>

      <AccountPrivacySection slug={slug} />
    </div>
  );
}
