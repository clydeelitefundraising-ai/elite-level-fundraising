import { getPlatformAdminSession } from "@/lib/platformAdminSession";

export const dynamic = "force-dynamic";

// Placeholder — proves the /platform-admin/* auth guard (layout.tsx) and
// getPlatformAdminSession() resolve correctly end-to-end for a real platform
// admin request. The actual Schools directory (search/filter, active-team
// counts, primary coach, status) ships in a later, separately reviewed
// phase — not part of Phase 2 (auth resolution only).
export default async function PlatformAdminSchoolsPage() {
  const platformAdmin = await getPlatformAdminSession();

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>ELF Platform Admin</h1>
      <p>
        Signed in as {platformAdmin?.name} ({platformAdmin?.email}).
      </p>
      <p>Schools directory ships in a later phase.</p>
    </div>
  );
}
