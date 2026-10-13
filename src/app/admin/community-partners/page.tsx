import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { resolveCommunityPartnersAdminPageState } from "./communityPartnersAccess";
import CommunityPartnersAdminView from "./CommunityPartnersAdminView";

export const dynamic = "force-dynamic";

// Phase 2.2A relocation — lives inside the main /admin Portal, so the
// outer shared-password gate (src/app/admin/layout.tsx's verifyToken
// check) has already passed by the time this page renders at all; that
// layout check is NOT re-duplicated here. Community Partners management
// itself additionally requires a real, individually-attributable Platform
// Admin session (getPlatformAdminSession) — the exact same authorization
// every /api/platform-admin/community-partners/* route already enforces
// independently. Both gates must pass; neither replaces the other. A
// visitor who only has the shared /admin password sees the sign-in prompt
// below, never CommunityPartnersAdminView (so no partner data or
// management control is ever rendered or fetched for them) — this is a
// first-of-its-kind page in this codebase that sits inside /admin's route
// tree but still requires the modern elf_accounts-backed identity, since
// no existing /admin page needed that combination before.
export default async function CommunityPartnersAdminPage() {
  const admin = await getPlatformAdminSession();
  const state = resolveCommunityPartnersAdminPageState(admin);

  if (state === "sign-in-required") {
    return (
      <div style={{ maxWidth: 480, margin: "3rem auto", textAlign: "center", padding: "0 1rem" }}>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0b1e3d", margin: "0 0 .6rem" }}>
          Platform Admin Sign-In Required
        </h1>
        <p style={{ fontSize: ".88rem", color: "#6b7280", lineHeight: 1.6, margin: "0 0 1.25rem" }}>
          Managing ELF Community Partners requires your individual ELF Platform Admin
          account, separate from the Admin Portal password. Sign in below, then return to
          this page from the Relationships menu.
        </p>
        <a
          href="/login"
          style={{ display: "inline-block", padding: ".6rem 1.25rem", background: "#0b1e3d", color: "#fff", borderRadius: 8, fontSize: ".85rem", fontWeight: 700, textDecoration: "none" }}
        >
          Sign In
        </a>
      </div>
    );
  }

  return <CommunityPartnersAdminView />;
}
