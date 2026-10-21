import type { ActiveCommunityPartner } from "@/lib/platform/communityPartners";
import { fillPartnerSlots } from "@/lib/platform/communityPartnerSlots";
import CommunityPartnerSlots from "@/components/communityPartners/CommunityPartnerSlots";

// ── Main view ─────────────────────────────────────────────────────────────
// Server-rendered content only — no client state. page.tsx has already
// resolved both "is advertising on for this school" and "what are the
// active partners," so this component's only job is to render exactly
// what it was handed: all 21 advertising positions in the same cards and
// grid as the Home screen (CommunityPartnerSlots — three columns on a
// phone) — the active partners first in their existing display_order,
// then blank positions. More than 21 active partners are all shown, with
// no blanks. Each partner tile links to its website (new tab,
// noopener/noreferrer) and marks a featured partner; with no partners
// yet, the explanatory line the old empty state carried stays above the
// open positions.
export default function CommunityPartnersListView({
  partners,
}: {
  partners: ActiveCommunityPartner[];
}) {
  const partnerCount = fillPartnerSlots(partners).filter(s => s.kind === "partner").length;

  return (
    <div>
      <div style={{ marginBottom: ".65rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Community
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            ELF Community Partners
          </h2>
          {partnerCount > 0 && (
            <span style={{ background: "var(--team-primary)", color: "var(--team-primary-foreground)", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem", lineHeight: 1.4 }}>
              {partnerCount} partner{partnerCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {partnerCount === 0 && (
          <p style={{ margin: ".4rem 0 0", fontSize: ".85rem", color: "var(--text-secondary-app)", lineHeight: 1.55, maxWidth: 560 }}>
            Our community partners help keep ELF Team free for coaches, athletes, and families while helping us offer low-fee fundraising to teams.
          </p>
        )}
      </div>

      <CommunityPartnerSlots partners={partners} variant="app" />
    </div>
  );
}
