import { ArrowUpRight } from "lucide-react";
import type { FeaturedPartner } from "@/lib/platform/communityPartnerRotation";

// Phase 2.2D-3 — shared by BOTH the mobile Home experience (HomeView.tsx)
// and the desktop CoachDashboard, same "one component, resolved once by
// page.tsx" discipline as CommunityPartnerGrid.tsx. A SEPARATE advertising
// placement from the 20-position grid — per the approved decision, the
// same partner may appear in both simultaneously; this component has no
// awareness of the grid, locked positions, or that rotation at all.
//
// Slim and professional: ~72-96px tall on mobile, ~88-112px on desktop
// where content permits (min-height set, not a fixed height, so a longer
// short_description can wrap without clipping mid-word). The whole
// banner is the link when a website exists — same safe-external-link
// pattern (target="_blank" rel="noopener noreferrer") already used by
// CommunityPartnerGrid.tsx and the Partners tab's CommunityPartnersListView.
export default function FeaturedPartnerBanner({ partner }: { partner: FeaturedPartner | null }) {
  if (!partner) return null;

  const content = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: ".75rem",
        minHeight: 72,
        padding: ".65rem .9rem",
        background: "var(--surface-light)",
        border: "1px solid var(--border-app)",
        borderRadius: "var(--radius-lg, 14px)",
        borderLeft: "3px solid #b45309",
      }}
    >
      {partner.logo_url ? (
        <img
          src={partner.logo_url}
          alt={partner.business_name}
          style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 8, flexShrink: 0, background: "var(--surface-light-elevated)" }}
        />
      ) : (
        // Accessible fallback when no logo is on file: a decorative
        // initial-letter tile (aria-hidden, since the business name is
        // already present as real text right next to it — no information
        // is lost by hiding this from assistive tech).
        <div
          aria-hidden="true"
          style={{
            width: 44, height: 44, borderRadius: 8, flexShrink: 0,
            background: "var(--surface-light-elevated)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: ".9rem", color: "var(--team-primary)",
          }}
        >
          {partner.business_name.trim()[0]?.toUpperCase() ?? "P"}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap", marginBottom: ".1rem" }}>
          <span
            style={{
              fontSize: ".58rem", fontWeight: 700, color: "#92400e", background: "#fef3c7",
              borderRadius: 100, padding: ".1rem .45rem", textTransform: "uppercase", letterSpacing: ".04em",
            }}
          >
            Featured Partner
          </span>
        </div>
        <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-primary-app)" }}>
          {partner.business_name}
        </div>
        {partner.short_description && (
          <div
            style={{
              fontSize: ".75rem", color: "var(--text-secondary-app)", marginTop: ".1rem",
              overflow: "hidden", display: "-webkit-box",
              WebkitLineClamp: 1, WebkitBoxOrient: "vertical" as const,
            }}
          >
            {partner.short_description}
          </div>
        )}
      </div>

      {partner.website_url && <ArrowUpRight size={16} aria-hidden="true" style={{ color: "var(--text-muted-app)", flexShrink: 0 }} />}
    </div>
  );

  // No website on file: logo/name/description still have standalone
  // value, so the banner still renders — just not wrapped in a link to
  // nowhere, and with no interactive/keyboard-focusable semantics added
  // where there's nothing to activate.
  if (!partner.website_url) return content;

  return (
    <a
      href={partner.website_url}
      target="_blank"
      rel="noopener noreferrer"
      className="elf-focus-ring"
      style={{ display: "block", textDecoration: "none" }}
    >
      {content}
    </a>
  );
}
