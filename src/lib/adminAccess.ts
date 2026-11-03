// Server-only. The ONE authorization check for the legacy /admin tool
// (every src/app/api/admin route and every /admin page) during the move to
// Platform Admin.
//
// Two ways in, checked in this order:
//   1. platform_admin   — the signed-in elf_session account has a live
//                         platform_admins row (getPlatformAdminSession,
//                         re-checked from the database on every request).
//                         Individually attributed in audit_logs.
//   2. shared_password  — the legacy elf_admin cookie (verifyToken). Kept
//                         TEMPORARILY so existing /admin users aren't locked
//                         out; audited as "admin_tool" (no individual
//                         identity). Remove this branch when /admin retires.
//
// The identity always comes from the server-side session — never from a
// request body, query string or header.
//
// Scope: this is ONLY for the legacy /admin tool. Platform-Admin-only
// operations (src/app/api/platform-admin/*, the /platform-admin pages,
// Community Partners management, moderation) keep calling
// getPlatformAdminSession() directly and never accept the shared password
// (enforced by src/lib/adminAccess.test.ts).
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/adminAuth";
import { ADMIN_TOOL_ACTOR, type AuditActor } from "@/lib/auditLog";
import { getPlatformAdminSession, type PlatformAdminIdentity } from "@/lib/platformAdminSession";

export type AdminAccess =
  | { via: "platform_admin"; admin: PlatformAdminIdentity }
  | { via: "shared_password" };

/** Who may use the legacy /admin tool right now, or null. A Platform Admin
 *  account wins over the shared-password cookie when both are present, so
 *  their actions are attributed to them. */
export async function getAdminAccess(): Promise<AdminAccess | null> {
  const admin = await getPlatformAdminSession();
  if (admin) return { via: "platform_admin", admin };
  const store = await cookies();
  if (verifyToken(store.get("elf_admin")?.value)) return { via: "shared_password" };
  return null;
}

/** The audit actor for an admin action: the individual Platform Admin, or
 *  the anonymous legacy "admin_tool" for the shared password. */
export function adminAuditActor(access: AdminAccess): AuditActor {
  if (access.via === "platform_admin") {
    return { type: "platform_admin", id: access.admin.platformAdminId, email: access.admin.email, name: access.admin.name };
  }
  return ADMIN_TOOL_ACTOR;
}

/** The standard refusal for /api/admin routes (unchanged shape). */
export function adminUnauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
