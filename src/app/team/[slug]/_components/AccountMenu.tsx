"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamSummary } from "@/lib/accountSession";
import PushOptIn from "./PushOptIn";

declare global {
  interface Window {
    __elfHasOpenOverlay?: () => boolean;
  }
}

export default function AccountMenu({
  currentSlug,
  teams,
  accountName,
  profilePhotoUrl,
}: {
  currentSlug:     string;
  teams:           TeamSummary[];
  accountName?:    string;
  profilePhotoUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Lets the Android shell's hardware back button close this dropdown instead of
  // exiting the app (MainActivity.java checks window.__elfHasOpenOverlay before
  // deciding what back should do). No-op outside the Capacitor Android WebView.
  useEffect(() => {
    if (!open) return;
    window.__elfHasOpenOverlay = () => true;
    const handleAndroidBack = () => setOpen(false);
    window.addEventListener("elfAndroidBackButton", handleAndroidBack);
    return () => {
      window.__elfHasOpenOverlay = undefined;
      window.removeEventListener("elfAndroidBackButton", handleAndroidBack);
    };
  }, [open]);

  const initial = accountName
    ? accountName.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("")
    : null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: profilePhotoUrl ? "transparent" : "rgba(255,255,255,.2)",
          border: "1.5px solid rgba(255,255,255,.35)",
          color: "#fff",
          fontWeight: 800,
          fontSize: initial ? ".65rem" : ".9rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          letterSpacing: ".01em",
          lineHeight: 1,
          overflow: "hidden",
          padding: 0,
        }}
      >
        {profilePhotoUrl ? (
          <img src={profilePhotoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          initial ?? "☰"
        )}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 99, background: "rgba(0,0,0,.4)" }}
          />
          <div style={{
            position: "absolute",
            top: "calc(100% + .5rem)",
            right: 0,
            zIndex: 100,
            background: "#fff",
            borderRadius: ".85rem",
            boxShadow: "0 8px 32px rgba(0,0,0,.22)",
            minWidth: 230,
            overflow: "hidden",
          }}>

            {/* Account identity */}
            {accountName && (
              <div style={{ padding: ".85rem 1rem .7rem", borderBottom: "1px solid #f0f0f0" }}>
                <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#0b1e3d" }}>{accountName}</div>
                <a
                  href="/teams"
                  onClick={() => setOpen(false)}
                  style={{ fontSize: ".72rem", color: "#6b7280", textDecoration: "none" }}
                >
                  My Account →
                </a>
              </div>
            )}

            {/* Team list */}
            {teams.length > 0 && (
              <div style={{ borderBottom: "1px solid #f0f0f0" }}>
                <div style={{ padding: ".55rem 1rem .3rem", fontSize: ".6rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em" }}>
                  {teams.length > 1 ? "Switch Team" : "Team"}
                </div>
                {teams.map(team => {
                  const isCurrent = team.campaign_slug === currentSlug;
                  return (
                    <button
                      key={team.campaign_slug}
                      onClick={() => {
                        setOpen(false);
                        if (!isCurrent) router.push(`/team/${team.campaign_slug}/home`);
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: ".65rem",
                        padding: ".6rem 1rem",
                        border: "none",
                        borderBottom: "1px solid #f8f8f8",
                        background: isCurrent ? "#f5f6f8" : "#fff",
                        cursor: isCurrent ? "default" : "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div style={{
                        width: 26, height: 26, borderRadius: "50%",
                        background: team.primary_color || "#0b1e3d",
                        flexShrink: 0, display: "flex", alignItems: "center",
                        justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: ".68rem",
                      }}>
                        {team.school_name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: ".84rem", fontWeight: 700, color: "#0b1e3d", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {team.school_name}
                        </div>
                        <div style={{ fontSize: ".68rem", color: "#6b7280" }}>{team.sport_name}</div>
                      </div>
                      {isCurrent && <span style={{ fontSize: ".68rem", color: "#22c55e", fontWeight: 800, flexShrink: 0 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Push notifications */}
            <div style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".65rem 1rem", borderBottom: "1px solid #f0f0f0" }}>
              <span style={{ fontSize: ".9rem" }}>🔔</span>
              <span style={{ flex: 1, fontSize: ".84rem", fontWeight: 600, color: "#374151" }}>Notifications</span>
              <PushOptIn slug={currentSlug} />
            </div>

            {/* My Profile */}
            <a
              href={`/team/${currentSlug}/profile`}
              onClick={() => setOpen(false)}
              style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".7rem 1rem", textDecoration: "none", borderBottom: "1px solid #f0f0f0" }}
            >
              <span style={{ fontSize: ".9rem" }}>👤</span>
              <span style={{ fontSize: ".84rem", fontWeight: 600, color: "#374151" }}>My Profile</span>
            </a>

            {/* Settings */}
            <a
              href={`/team/${currentSlug}/settings`}
              onClick={() => setOpen(false)}
              style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".7rem 1rem", textDecoration: "none", borderBottom: "1px solid #f0f0f0" }}
            >
              <span style={{ fontSize: ".9rem" }}>⚙️</span>
              <span style={{ fontSize: ".84rem", fontWeight: 600, color: "#374151" }}>Settings</span>
            </a>

            {/* Sign Out */}
            <form method="POST" action="/api/auth/logout">
              <button
                type="submit"
                style={{ width: "100%", display: "flex", alignItems: "center", gap: ".65rem", padding: ".7rem 1rem", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ fontSize: ".9rem" }}>↩</span>
                <span style={{ fontSize: ".84rem", fontWeight: 600, color: "#9ca3af" }}>Sign Out</span>
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
