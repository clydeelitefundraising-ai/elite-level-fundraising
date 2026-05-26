"use client";

import { useAppStore } from "../../_store/AppStore";
import SponsorCarousel from "../_components/SponsorCarousel";
import AnimatedProgress from "../_components/AnimatedProgress";

export default function HomePage() {
  const { announcements, fundraisingData, calendarEvents, heroStats, spotlightAthlete, teamInfo } = useAppStore();

  const pct = Math.round((fundraisingData.raised / fundraisingData.goal) * 100);
  const nextEvent = calendarEvents[0];
  const nextGame  = calendarEvents.find((e) => e.type === "game");

  return (
    <div className="ta-page-enter">

      {/* ── HERO BANNER ── */}
      <div
        style={{
          position: "relative",
          background: "linear-gradient(145deg, #05101F 0%, #0B1E3D 55%, #0F2A50 100%)",
          minHeight: 230,
        }}
      >
        {/* Dot-grid texture */}
        <div
          style={{
            position: "absolute", inset: 0,
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            pointerEvents: "none",
          }}
        />
        {/* Gold ambient glow */}
        <div
          style={{
            position: "absolute", top: -70, right: -70,
            width: 260, height: 260, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(201,168,76,0.22) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        {/* Bottom gradient fade */}
        <div
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 48,
            background: "linear-gradient(to bottom, transparent, rgba(5,16,31,0.35))",
            pointerEvents: "none",
          }}
        />

        {/* Hero content */}
        <div style={{ position: "relative", zIndex: 1, padding: "20px 20px 22px" }}>
          {/* Sport + season badge */}
          <div
            className="inline-flex items-center gap-1.5"
            style={{
              padding: "4px 10px", borderRadius: 100, marginBottom: 14,
              background: "rgba(201,168,76,0.12)",
              border: "1px solid rgba(201,168,76,0.28)",
            }}
          >
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#C9A84C" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#C9A84C", letterSpacing: "0.05em" }}>
              {teamInfo.sport}&nbsp;&middot;&nbsp;{teamInfo.season}
            </span>
          </div>

          {/* Team name */}
          <div>
            <p
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 17, letterSpacing: "0.14em",
                color: "rgba(255,255,255,0.4)", lineHeight: 1, marginBottom: 2,
              }}
            >
              {teamInfo.shortName.toUpperCase()}
            </p>
            <p
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 54, letterSpacing: "0.04em",
                color: "#FFFFFF", lineHeight: 0.9,
              }}
            >
              {teamInfo.mascot.toUpperCase()}
            </p>
          </div>

          {/* Season stats strip */}
          <div style={{ display: "flex", gap: 28, marginTop: 18 }}>
            {heroStats.map((s) => (
              <div key={s.label}>
                <p style={{ fontSize: 26, fontWeight: 800, color: "#FFFFFF", lineHeight: 1 }}>
                  {s.value}
                </p>
                <p
                  style={{
                    fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
                    color: "rgba(255,255,255,0.38)", marginTop: 3,
                  }}
                >
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ padding: "16px 16px 28px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Next game callout ── */}
        {nextGame && (
          <div
            style={{
              background: "linear-gradient(90deg, #0B1E3D, #1A3A5C)",
              borderRadius: 20, padding: "14px 16px",
              display: "flex", alignItems: "center", gap: 14,
              boxShadow: "0 4px 20px rgba(11,30,61,0.22)",
            }}
          >
            <div
              style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: "rgba(201,168,76,0.15)",
                border: "1px solid rgba(201,168,76,0.3)",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, color: "#C9A84C", letterSpacing: "0.08em" }}>
                {nextGame.date.split(" ")[0].toUpperCase()}
              </span>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#FFFFFF", lineHeight: 1 }}>
                {nextGame.date.split(" ")[1].replace(",", "")}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Next Game
              </p>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", marginTop: 2 }}>
                {nextGame.title}
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>
                {nextGame.time} &middot; {nextGame.location}
              </p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        )}

        {/* ── Latest announcement ── */}
        {announcements[0] && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
              Latest Update
            </p>
            <div
              className="ta-pressable"
              style={{
                background: "#FFFFFF",
                borderRadius: 20, padding: "16px",
                boxShadow: "0 2px 14px rgba(0,0,0,0.07)",
                display: "flex", gap: 14,
              }}
            >
              <div
                style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: announcements[0].type === "milestone" ? "rgba(201,168,76,0.12)" : "rgba(26,58,92,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {announcements[0].type === "milestone" ? (
                  <span style={{ fontSize: 18 }}>🏆</span>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v1m0 8v1M9.5 9.5c0-1.1.9-2 2.5-2s2.5.9 2.5 2-1 1.8-2.5 2-2.5 1-2.5 2 .9 2 2.5 2 2.5-.9 2.5-2" />
                  </svg>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#0A0A0A", lineHeight: 1.3, marginBottom: 5 }}>
                  {announcements[0].title}
                </p>
                <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
                  {announcements[0].body}
                </p>
                <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
                  {announcements[0].date}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Fundraising progress snapshot ── */}
        <div
          style={{
            background: "linear-gradient(135deg, #0A1828, #0B1E3D)",
            borderRadius: 22, padding: "18px 18px 16px",
            boxShadow: "0 8px 32px rgba(11,30,61,0.28)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Fundraising
              </p>
              <p style={{ fontSize: 30, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.1, marginTop: 2 }}>
                ${fundraisingData.raised.toLocaleString()}
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>
                of ${fundraisingData.goal.toLocaleString()} goal
              </p>
            </div>
            <div
              style={{
                padding: "5px 11px", borderRadius: 100,
                background: "rgba(201,168,76,0.15)",
                border: "1px solid rgba(201,168,76,0.28)",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: "#C9A84C" }}>
                {fundraisingData.daysLeft}d left
              </span>
            </div>
          </div>

          <AnimatedProgress pct={pct} height={8} />

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>
              {fundraisingData.donors} donors
            </p>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#C9A84C" }}>{pct}%</p>
          </div>
        </div>

        {/* ── Athlete spotlight ── */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
            Athlete Spotlight
          </p>
          <div
            style={{
              background: "linear-gradient(135deg, #0B1E3D 0%, #1A3A5C 100%)",
              borderRadius: 22, padding: "18px 18px 0",
              boxShadow: "0 6px 24px rgba(11,30,61,0.25)",
              overflow: "hidden",
            }}
          >
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#C9A84C">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Athlete Spotlight
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              <div
                style={{
                  width: 62, height: 62, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, #C9A84C, #F0C040)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, fontWeight: 900, color: "#0B1E3D",
                  boxShadow: "0 4px 16px rgba(201,168,76,0.35)",
                }}
              >
                {spotlightAthlete.initials}
              </div>

              <div>
                <p style={{ fontSize: 18, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.2 }}>
                  {spotlightAthlete.name}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                    #{spotlightAthlete.number} &middot; {spotlightAthlete.position}
                  </span>
                  <span
                    style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
                      background: "rgba(201,168,76,0.18)", color: "#C9A84C",
                    }}
                  >
                    {spotlightAthlete.badge}
                  </span>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {spotlightAthlete.stats.map((s, i) => (
                <div
                  key={s.label}
                  style={{
                    flex: 1, textAlign: "center", padding: "14px 0",
                    borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.08)" : "none",
                  }}
                >
                  <p style={{ fontSize: 17, fontWeight: 800, color: "#FFFFFF", lineHeight: 1 }}>
                    {s.value}
                  </p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", marginTop: 3, letterSpacing: "0.04em" }}>
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Sponsor carousel ── */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
            Team Sponsors
          </p>
          <SponsorCarousel />
        </div>

        {/* ── Upcoming event preview ── */}
        {nextEvent && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
              Next Up
            </p>
            <div
              className="ta-pressable"
              style={{
                background: "#FFFFFF",
                borderRadius: 20, padding: "14px 16px",
                boxShadow: "0 2px 14px rgba(0,0,0,0.07)",
                display: "flex", alignItems: "center", gap: 14,
              }}
            >
              <div
                style={{
                  width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                  background: "#F5F0EA",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: "#C9A84C", letterSpacing: "0.06em" }}>
                  {nextEvent.date.split(" ")[0].toUpperCase()}
                </span>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#0B1E3D", lineHeight: 1 }}>
                  {nextEvent.date.split(" ")[1].replace(",", "")}
                </span>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#0A0A0A" }}>
                  {nextEvent.title}
                </p>
                <p style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                  {nextEvent.time}
                </p>
                <p style={{ fontSize: 11, color: "#9CA3AF" }}>
                  {nextEvent.location}
                </p>
              </div>

              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
