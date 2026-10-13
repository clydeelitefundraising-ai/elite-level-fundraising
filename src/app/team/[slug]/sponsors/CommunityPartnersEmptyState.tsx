import { Handshake } from "lucide-react";

// Phase 2.1 built this as a placeholder ("Partners coming soon") since no
// real partner data existed yet. Phase 2.2C now reaches this same empty
// state for a DIFFERENT, real reason: advertising is on for this school
// but no admin has activated any partner yet — "coming soon" would be
// actively wrong once the feature is live, so the copy changed to
// "No partners yet" without implying anything is still being built.
// Always "ELF Community Partners" (never bare "Community Partners") — see
// the Phase 2.1 audit's terminology-collision note: team sponsors already
// use a tier literally labeled "Community Partner" on the public campaign
// page, and this full name keeps the two concepts visibly distinct.
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
          No partners yet. Check back soon.
        </div>
      </div>
    </div>
  );
}
