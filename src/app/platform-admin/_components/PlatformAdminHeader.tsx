"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { isNativeIosApp, performNativeAwareLogout } from "@/lib/nativePushDevice";

export default function PlatformAdminHeader({ name, email }: { name: string; email: string }) {
  const router = useRouter();

  return (
    <header
      style={{
        background: "#0b1e3d",
        color: "#fff",
        padding: ".65rem .875rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: ".5rem",
        flexWrap: "wrap",
      }}
    >
      {/* Email is hidden below 480px — at phone width there isn't room to
          show name + email + Sign Out without cramping or truncating the
          email mid-address, so the narrow layout shows only the name.
          Brand ("ELF Platform Admin") always stays visible per spec. */}
      <style>{`
        .pa-header-email { display: none; }
        @media (min-width: 480px) { .pa-header-email { display: inline; } }
      `}</style>

      <Link href="/platform-admin/schools" style={{ color: "#fff", textDecoration: "none", display: "flex", alignItems: "center", gap: ".5rem", minWidth: 0, flexShrink: 0 }}>
        <span style={{ fontWeight: 800, fontSize: ".95rem", whiteSpace: "nowrap" }}>ELF Platform Admin</span>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: ".6rem", minWidth: 0 }}>
        <span
          style={{
            fontSize: ".78rem", color: "rgba(255,255,255,.75)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            maxWidth: 180,
          }}
        >
          {name}
          <span className="pa-header-email" style={{ opacity: .7 }}> ({email})</span>
        </span>
        <form
          method="POST"
          action="/api/auth/logout"
          onSubmit={e => {
            if (!isNativeIosApp()) return;
            e.preventDefault();
            void performNativeAwareLogout(router);
          }}
        >
          <button
            type="submit"
            style={{
              background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.25)",
              color: "#fff", borderRadius: ".5rem", padding: ".5rem .85rem",
              minHeight: "2.5rem", fontSize: ".8rem", fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Sign Out
          </button>
        </form>
      </div>
    </header>
  );
}
