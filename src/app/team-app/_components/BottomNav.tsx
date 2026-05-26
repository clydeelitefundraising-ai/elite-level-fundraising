"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  label: string;
  href: string;
  icon: (active: boolean) => React.ReactNode;
};

const tabs: Tab[] = [
  {
    label: "Home",
    href: "/team-app/home",
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={a ? "#C9A84C" : "none"} stroke={a ? "#C9A84C" : "#A0A8B4"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    label: "Fundraiser",
    href: "/team-app/fundraiser",
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#C9A84C" : "#A0A8B4"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v1m0 8v1M9.5 9.5c0-1.1.9-2 2.5-2s2.5.9 2.5 2-1 1.8-2.5 2-2.5 1-2.5 2 .9 2 2.5 2 2.5-.9 2.5-2" />
      </svg>
    ),
  },
  {
    label: "Shop",
    href: "/team-app/shop",
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#C9A84C" : "#A0A8B4"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    ),
  },
  {
    label: "Roster",
    href: "/team-app/roster",
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#C9A84C" : "#A0A8B4"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    label: "Calendar",
    href: "/team-app/calendar",
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#C9A84C" : "#A0A8B4"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8"  y1="2" x2="8"  y2="6" />
        <line x1="3"  y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    label: "Updates",
    href: "/team-app/updates",
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#C9A84C" : "#A0A8B4"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon fill={a ? "#C9A84C" : "none"} points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 010 7.07" />
        <path d="M19.07 4.93a10 10 0 010 14.14" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <div
      role="navigation"
      aria-label="App navigation"
      style={{
        flexShrink: 0,
        pointerEvents: "auto",
        /* Frosted glass — semi-transparent so blur picks up any bleed-through */
        background: "rgba(252, 249, 244, 0.88)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderTop: "1px solid rgba(234, 229, 221, 0.55)",
        boxShadow: [
          "0 -0.5px 0 rgba(0,0,0,0.06)",
          "0 -10px 32px rgba(0,0,0,0.06)",
          "inset 0 1px 0 rgba(255,255,255,0.75)",
        ].join(", "),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          /* 72px row — slightly taller for comfortable thumb targets */
          minHeight: 72,
        }}
      >
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingTop: 10,
                paddingBottom: 12,
                textDecoration: "none",
                WebkitTapHighlightColor: "transparent",
                transition: "opacity 0.12s ease",
              }}
              /* Inline active feedback */
              onMouseDown={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.7"; }}
              onMouseUp={(e)   => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1";   }}
              onMouseLeave={(e)=> { (e.currentTarget as HTMLAnchorElement).style.opacity = "1";   }}
              onTouchStart={(e)=> { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.7"; }}
              onTouchEnd={(e)  => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1";   }}
            >
              {/* Icon pill — primary active affordance */}
              <div
                className={active ? "ta-tab-icon--active" : undefined}
                style={{
                  width: 52,
                  height: 34,
                  borderRadius: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: active ? "rgba(201,168,76,0.13)" : "transparent",
                  boxShadow: active ? "0 2px 12px rgba(201,168,76,0.26)" : "none",
                  /* background/shadow transition; transform handled by ta-tab-pop animation */
                  transition: "background 0.22s ease, box-shadow 0.22s ease",
                }}
              >
                {tab.icon(active)}
              </div>

              {/* Label */}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: active ? 700 : 500,
                  color: active ? "#C9A84C" : "#A0A8B4",
                  letterSpacing: active ? "0.01em" : "0",
                  lineHeight: 1,
                  /* Prevent wrapping — "Fundraiser" is the longest */
                  whiteSpace: "nowrap",
                  transition: "color 0.22s ease, font-weight 0.1s ease",
                }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* iOS home-indicator safe area */}
      <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
    </div>
  );
}
