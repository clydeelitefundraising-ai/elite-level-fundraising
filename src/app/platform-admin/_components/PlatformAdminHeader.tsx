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
        padding: ".85rem 1rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: ".75rem",
        flexWrap: "wrap",
      }}
    >
      <Link href="/platform-admin/schools" style={{ color: "#fff", textDecoration: "none", display: "flex", alignItems: "center", gap: ".5rem", minWidth: 0 }}>
        <span style={{ fontWeight: 800, fontSize: "1rem", whiteSpace: "nowrap" }}>ELF Platform Admin</span>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: ".75rem", minWidth: 0 }}>
        <span style={{ fontSize: ".8rem", color: "rgba(255,255,255,.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
          {name} <span style={{ opacity: .7 }}>({email})</span>
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
              color: "#fff", borderRadius: ".5rem", padding: ".4rem .75rem",
              fontSize: ".8rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Sign Out
          </button>
        </form>
      </div>
    </header>
  );
}
