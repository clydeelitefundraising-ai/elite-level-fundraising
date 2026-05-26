"use client";

import { useAppStore } from "../../_store/AppStore";

export default function TeamHeader() {
  const { teamInfo, primaryColor, secondaryColor } = useAppStore();

  return (
    <div
      className="flex items-center gap-3 flex-shrink-0"
      style={{
        background: primaryColor,
        padding: "10px 16px 11px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
          background: secondaryColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 900, color: primaryColor,
          letterSpacing: "0.03em",
          boxShadow: `0 2px 8px ${secondaryColor}66, 0 0 0 2px ${secondaryColor}33`,
        }}
      >
        {teamInfo.logoInitials}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 14, fontWeight: 700, color: "#FFFFFF",
            lineHeight: 1.2, letterSpacing: "0.01em",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {teamInfo.school}
        </p>
        <p style={{ fontSize: 11, color: `${secondaryColor}CC`, marginTop: 1 }}>
          {teamInfo.sport}&nbsp;&middot;&nbsp;{teamInfo.season}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          style={{
            width: 34, height: 34, borderRadius: 10,
            background: "rgba(255,255,255,0.07)",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.6)",
          }}
          aria-label="Notifications"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
        </button>

        <button
          style={{
            width: 34, height: 34, borderRadius: 10,
            background: "rgba(255,255,255,0.07)",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.6)",
          }}
          aria-label="Team settings"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
