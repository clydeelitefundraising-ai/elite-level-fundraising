import { Handshake } from "lucide-react";

// Phase 2.1 — placeholder only. No fabricated businesses, logos, or counts
// — Phase 2.2 builds the real centrally-managed partner records and admin
// tooling; this is purely the approved copy + a polished "coming soon"
// treatment until that data exists. Always "ELF Community Partners" (never
// bare "Community Partners") — see the Phase 2.1 audit's terminology-
// collision note: team sponsors already use a tier literally labeled
// "Community Partner" on the public campaign page, and this full name
// keeps the two concepts visibly distinct.
export default function CommunityPartnersEmptyState() {
  return (
    <div>
      <h2 style={{ margin: "0 0 .4rem", fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em" }}>
        ELF Community Partners
      </h2>
      <p style={{ margin: "0 0 1.1rem", fontSize: ".85rem", color: "var(--text-secondary-app)", lineHeight: 1.55, maxWidth: 560 }}>
        Our community partners help keep ELF Team free for coaches, athletes, and families while helping us offer low-fee fundraising to teams.
      </p>

      <div style={{
        background: "var(--surface-light)", borderRadius: "var(--radius-lg)", padding: "2.25rem 1.5rem",
        textAlign: "center", border: "1px solid var(--border-app)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: ".5rem",
      }}>
        <Handshake size={28} style={{ color: "var(--text-muted-app)", opacity: .6 }} />
        <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-secondary-app)" }}>
          Partners coming soon.
        </div>
      </div>
    </div>
  );
}
