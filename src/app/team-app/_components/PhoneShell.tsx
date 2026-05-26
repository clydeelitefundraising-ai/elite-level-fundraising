/**
 * PhoneShell — Simple phone frame for desktop preview.
 *
 * Intentionally minimal:
 *   • No decorative overlays, no glass layers, no z-index juggling
 *   • No absolute-positioned elements inside the screen
 *   • overflow: hidden on the outer frame ONLY (clips to border-radius)
 *   • Screen is a plain flex column at height: 100%
 *
 * Layout contract (children = TeamHeader + main + BottomNav):
 *   status-bar  →  flex-shrink: 0, height: 44px, pointer-events: none
 *   TeamHeader  →  flex-shrink: 0  (set in TeamHeader via className)
 *   main        →  flex: 1, min-height: 0, overflow-y: auto
 *   BottomNav   →  flex-shrink: 0  (set in BottomNav via inline style)
 */
export default function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    /* Desktop canvas — centers the phone in the viewport */
    <div
      className="ta-phone-shell"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "40px 20px",
        background: "linear-gradient(180deg, #0E0E10 0%, #111113 100%)",
      }}
    >
      {/* Outer phone frame — the only overflow: hidden; clips rounded corners */}
      <div
        style={{
          width: "100%",
          maxWidth: 393,
          height: "clamp(640px, calc(100vh - 80px), 852px)",
          borderRadius: 44,
          border: "2px solid #2C2C2E",
          boxShadow: [
            "0 0 0 1px rgba(0,0,0,0.85)",
            "0 0 0 3px rgba(255,255,255,0.04)",
            "0 48px 96px rgba(0,0,0,0.72)",
            "0 20px 40px rgba(0,0,0,0.45)",
            "0  6px 14px rgba(0,0,0,0.28)",
          ].join(", "),
          overflow: "hidden",
          background: "#0A0A0C",
        }}
      >
        {/* Screen — fills the frame, plain flex column */}
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: "#F5F0EA",
          }}
        >
          {/* Status bar — decorative only, not interactive */}
          <div
            aria-hidden="true"
            style={{
              flexShrink: 0,
              height: 44,
              background: "#0A1828",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 24px",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {/* Time */}
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "rgba(255,255,255,0.9)",
                letterSpacing: "-0.4px",
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}
            >
              9:41
            </span>

            {/* Status icons */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Signal bars */}
              <svg width="16" height="11" viewBox="0 0 16 11" fill="none" aria-hidden="true">
                <rect x="0"    y="7"   width="2.5" height="4"   rx="0.5" fill="white" />
                <rect x="4"    y="4.5" width="2.5" height="6.5" rx="0.5" fill="white" />
                <rect x="8.5"  y="2"   width="2.5" height="9"   rx="0.5" fill="white" fillOpacity="0.4" />
                <rect x="13"   y="0"   width="2.5" height="11"  rx="0.5" fill="white" fillOpacity="0.4" />
              </svg>
              {/* Battery */}
              <svg width="25" height="12" viewBox="0 0 25 12" fill="none" aria-hidden="true">
                <rect x="0.5" y="0.5" width="20" height="11" rx="2.8" stroke="white" strokeOpacity="0.45" />
                <rect x="2"   y="2"   width="14" height="8"  rx="1.5" fill="white" />
                <path d="M22 4v4a2.1 2.1 0 000-4z" fill="white" fillOpacity="0.4" />
              </svg>
            </div>
          </div>

          {/* App content: TeamHeader + main + BottomNav */}
          {children}
        </div>
      </div>
    </div>
  );
}
