import Link from "next/link";

// Rendered only when actor.kind === "platform_admin" (see TeamLayout) —
// never shown to a real coach/booster/parent/athlete. Purely a visual
// indicator: it does not change who the acting identity is anywhere else
// in the app — audit_logs still attributes every action to the platform
// admin's own platform_admins.id (see src/lib/auditLog.ts's toAuditActor),
// never to this team's Head Coach.
export default function PlatformAdminBanner({ teamLabel }: { teamLabel: string }) {
  return (
    <div
      style={{
        background: "#C4A35A",
        color: "#0b1e3d",
        padding: ".55rem .875rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: ".75rem",
        fontSize: ".78rem",
        fontWeight: 700,
      }}
    >
      {/* flex:1 + minWidth:0 is what actually makes the ellipsis/nowrap work
          inside a flex row — without it, a long team name can force this
          item to its intrinsic content width and push "Back to Schools"
          off-screen (horizontal overflow) at narrow widths instead of
          truncating. */}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto", minWidth: 0 }}>
        ELF Admin · Managing {teamLabel}
      </span>
      <Link
        href="/platform-admin/schools"
        style={{ color: "#0b1e3d", textDecoration: "underline", whiteSpace: "nowrap", flexShrink: 0 }}
      >
        ← Back to Schools
      </Link>
    </div>
  );
}
