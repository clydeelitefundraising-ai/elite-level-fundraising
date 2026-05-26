"use client";

import { useEffect, useState } from "react";
import { sponsors } from "../_data/mockData";

const tierStyles = {
  Gold:   { bg: "rgba(201,168,76,0.1)",  border: "rgba(201,168,76,0.35)",  text: "#92700A",  badge: "#C9A84C"  },
  Silver: { bg: "rgba(156,163,175,0.1)", border: "rgba(156,163,175,0.35)", text: "#4B5563",  badge: "#9CA3AF"  },
  Bronze: { bg: "rgba(184,115,51,0.1)",  border: "rgba(184,115,51,0.3)",   text: "#7C4A1E",  badge: "#B87333"  },
};

export default function SponsorCarousel() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setActive((prev) => (prev + 1) % sponsors.length);
        setVisible(true);
      }, 240);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  const sponsor = sponsors[active];
  const style = tierStyles[sponsor.tier];

  function goTo(i: number) {
    setVisible(false);
    setTimeout(() => { setActive(i); setVisible(true); }, 150);
  }

  return (
    <div>
      {/* Sponsor card */}
      <div
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 0.24s ease, transform 0.24s ease",
          background: "#FFFFFF",
          borderRadius: 20,
          padding: "16px 16px",
          boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        {/* Logo placeholder — TODO: replace with sponsor.logoUrl */}
        <div
          style={{
            width: 56, height: 56, borderRadius: 14, flexShrink: 0,
            background: style.bg,
            border: `1.5px solid ${style.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 800, color: style.text,
            letterSpacing: "0.03em",
          }}
        >
          {sponsor.initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#0A0A0A", lineHeight: 1.2 }}>
              {sponsor.name}
            </p>
            <span
              style={{
                fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                background: `${style.badge}22`, color: style.text,
                textTransform: "uppercase", letterSpacing: "0.07em", flexShrink: 0,
              }}
            >
              {sponsor.tier}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.3 }}>{sponsor.tagline}</p>
        </div>
      </div>

      {/* Dot indicators */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }}>
        {sponsors.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Sponsor ${i + 1}`}
            style={{
              width: active === i ? 20 : 6, height: 6, borderRadius: 3,
              background: active === i ? "#C9A84C" : "#D1D5DB",
              border: "none", padding: 0, cursor: "pointer",
              transition: "all 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
