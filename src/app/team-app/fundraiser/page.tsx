"use client";

import { useAppStore } from "../../_store/AppStore";
import AnimatedProgress from "../_components/AnimatedProgress";

const medals = ["🥇", "🥈", "🥉"];

const avatarGrads = [
  "linear-gradient(135deg, #C9A84C, #F0C040)",
  "linear-gradient(135deg, #0B1E3D, #1A3A5C)",
  "linear-gradient(135deg, #1A3A5C, #2A5080)",
  "linear-gradient(135deg, #4B5563, #6B7280)",
  "linear-gradient(135deg, #92700A, #C9A84C)",
];

export default function FundraiserPage() {
  const { fundraisingData, leaderboard } = useAppStore();

  const pct = Math.round((fundraisingData.raised / fundraisingData.goal) * 100);
  const topRaiser = leaderboard[0];
  const remaining = fundraisingData.goal - fundraisingData.raised;

  return (
    <div className="ta-page-enter">

      {/* ── Sticky mini-progress header ── */}
      <div
        className="sticky top-0 z-10"
        style={{
          background: "rgba(245,240,234,0.95)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
          padding: "10px 16px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", lineHeight: 1.3, flex: 1, marginRight: 12 }}>
            {fundraisingData.campaignName}
          </p>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#C9A84C", flexShrink: 0 }}>
            {pct}%
          </span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: "#E8E3DC", overflow: "hidden" }}>
          <div
            style={{
              height: "100%", width: `${pct}%`,
              background: "linear-gradient(90deg, #C9A84C, #F0C040)",
              borderRadius: 2,
            }}
          />
        </div>
      </div>

      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* ── Big numbers card ── */}
        <div
          style={{
            background: "linear-gradient(145deg, #06101F, #0B1E3D)",
            borderRadius: 24, padding: "22px 20px 20px",
            boxShadow: "0 10px 40px rgba(11,30,61,0.35)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.38)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Total Raised
              </p>
              <p
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 48, letterSpacing: "0.02em",
                  color: "#FFFFFF", lineHeight: 1, marginTop: 4,
                }}
              >
                ${fundraisingData.raised.toLocaleString()}
              </p>
            </div>
            <div style={{ textAlign: "right", paddingBottom: 6 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>GOAL</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: "#C9A84C", lineHeight: 1.1 }}>
                ${fundraisingData.goal.toLocaleString()}
              </p>
            </div>
          </div>

          <AnimatedProgress
            pct={pct}
            height={10}
            trackColor="rgba(255,255,255,0.1)"
            gradient="linear-gradient(90deg, #C9A84C 0%, #F0C040 100%)"
          />

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>{pct}% complete</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>
              ${remaining.toLocaleString()} to go
            </p>
          </div>
        </div>

        {/* ── Quick stats strip ── */}
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { label: "Donors",       value: fundraisingData.donors.toString() },
            { label: "Days Left",    value: fundraisingData.daysLeft.toString() },
            { label: "Avg Donation", value: `$${fundraisingData.avgDonation}` },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                flex: 1, background: "#FFFFFF", borderRadius: 16, padding: "14px 12px",
                boxShadow: "0 2px 12px rgba(0,0,0,0.07)", textAlign: "center",
              }}
            >
              <p style={{ fontSize: 22, fontWeight: 800, color: "#0B1E3D" }}>{s.value}</p>
              <p style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3, fontWeight: 600, letterSpacing: "0.04em" }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>

        {/* ── Top raiser callout ── */}
        {topRaiser && (
          <div
            style={{
              background: "rgba(201,168,76,0.09)",
              border: "1px solid rgba(201,168,76,0.28)",
              borderRadius: 18, padding: "14px 16px",
              display: "flex", alignItems: "center", gap: 14,
            }}
          >
            <div
              style={{
                width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg, #C9A84C, #F0C040)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18,
              }}
            >
              🏆
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#C9A84C", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Top Fundraiser
              </p>
              <p style={{ fontSize: 15, fontWeight: 800, color: "#0A0A0A", marginTop: 2 }}>
                {topRaiser.name}
              </p>
              <p style={{ fontSize: 12, color: "#6B7280", marginTop: 1 }}>
                ${topRaiser.raised.toLocaleString()} raised &middot; {topRaiser.donors} donors
              </p>
            </div>
          </div>
        )}

        {/* ── Leaderboard ── */}
        {leaderboard.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
              Athlete Leaderboard
            </p>

            <div
              style={{
                background: "#FFFFFF", borderRadius: 20,
                boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
                overflow: "hidden",
              }}
            >
              {leaderboard.map((athlete, i) => {
                const barPct = Math.round((athlete.raised / leaderboard[0].raised) * 100);
                return (
                  <div
                    key={athlete.id}
                    className="ta-stagger-child"
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 16px",
                      borderBottom: i < leaderboard.length - 1 ? "1px solid #F5F1EC" : "none",
                      "--i": i,
                    } as React.CSSProperties}
                  >
                    <div style={{ width: 22, textAlign: "center", flexShrink: 0 }}>
                      {i < 3 ? (
                        <span style={{ fontSize: 16 }}>{medals[i]}</span>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF" }}>#{i + 1}</span>
                      )}
                    </div>

                    <div
                      style={{
                        width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                        background: avatarGrads[i % avatarGrads.length],
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 800,
                        color: i === 0 ? "#0B1E3D" : "#FFFFFF",
                      }}
                    >
                      {athlete.initials}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#0A0A0A", lineHeight: 1.2 }}>
                        {athlete.name}
                      </p>
                      <div style={{ marginTop: 5, height: 4, borderRadius: 2, background: "#F3F4F6", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%", width: `${barPct}%`,
                            background: i === 0 ? "linear-gradient(90deg, #C9A84C, #F0C040)" : "#0B1E3D",
                            borderRadius: 2,
                            opacity: i === 0 ? 1 : 0.5 + i * 0.08,
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: "#0B1E3D" }}>
                        ${athlete.raised.toLocaleString()}
                      </p>
                      <p style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1 }}>
                        {athlete.donors} donors
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Donate CTA ── */}
        <div>
          <button
            className="ta-gold-pulse"
            style={{
              width: "100%", padding: "16px",
              borderRadius: 18, border: "none", cursor: "not-allowed",
              background: "linear-gradient(90deg, #C9A84C, #F0C040)",
              fontSize: 16, fontWeight: 800, color: "#0B1E3D",
              letterSpacing: "0.02em",
              opacity: 0.7,
            }}
            disabled
          >
            Donate to the Team
          </button>
          <p style={{ textAlign: "center", fontSize: 11, color: "#9CA3AF", marginTop: 10 }}>
            Stripe checkout will be wired here
          </p>
        </div>

      </div>
    </div>
  );
}
