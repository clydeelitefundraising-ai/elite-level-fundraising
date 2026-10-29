"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { performNativeAwareLogout } from "@/lib/nativePushDevice";

// Sign Out at the bottom of the Settings home — the same control the old
// coach SettingsView had, now shown to every role. Phase 10: routes through
// the shared logout helper so a native device's own push token (if any) is
// deactivated server-side alongside the existing cookie-clearing logout.
export default function SignOutButton() {
  const router = useRouter();
  const handleSignOut = () => performNativeAwareLogout(router);
  return (
    <div style={{ background: "var(--surface-light)", borderRadius: "var(--radius-lg)", padding: ".4rem", border: "1px solid var(--border-app)", marginTop: "1.25rem" }}>
      <button
        type="button"
        onClick={handleSignOut}
        className="elf-focus-ring"
        style={{ width: "100%", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: ".4rem", fontSize: ".84rem", fontWeight: 700, color: "var(--color-error)", background: "none", padding: ".6rem .75rem", borderRadius: 7, border: "none", cursor: "pointer" }}
      >
        <LogOut size={15} aria-hidden="true" /> Sign Out
      </button>
    </div>
  );
}
