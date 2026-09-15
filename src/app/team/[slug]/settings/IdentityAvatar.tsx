// QA fix: the Settings identity card (both the coach strip in
// SettingsView and the general strip in MemberSettingsView) always showed
// initials, even when the signed-in account has a real profile photo.
// Reuses the SAME photo source AccountMenu already displays
// (elf_accounts.profile_photo_url via getAccountSession(), threaded down
// from settings/page.tsx) — no second photo storage/resolution system.
export default function IdentityAvatar({
  name,
  photoUrl,
  size = 38,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: "var(--team-primary)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: ".7rem",
      fontWeight: 800,
      color: "var(--team-primary-foreground)",
      flexShrink: 0,
      letterSpacing: ".02em",
      overflow: "hidden",
    }}>
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={`${name}'s profile photo`}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initials
      )}
    </div>
  );
}
