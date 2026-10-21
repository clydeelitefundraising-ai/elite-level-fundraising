import type { CSSProperties } from "react";
import { Plus } from "lucide-react";
import type { GridSlot } from "@/lib/platform/communityPartnerRotation";
import { AVAILABLE_SLOT_LABEL, fillPartnerSlots, partnerHref } from "@/lib/platform/communityPartnerSlots";

// Phase 2.2D-2 — shared by BOTH the mobile Home experience (HomeView.tsx's
// HomeContent, rendered at every width for non-coach-dashboard roles and
// below the 1024px breakpoint for everyone else) and the desktop
// CoachDashboard. Deliberately ONE component, not two near-duplicates —
// page.tsx resolves `slots` exactly once per request and hands the same
// array to both render paths, so there is no possibility of mobile and
// desktop disagreeing about which partner occupies which position; this
// component then renders that resolved list identically everywhere.
//
// A CSS grid with auto-fill columns (not the Team Sponsors section's
// horizontal-scroll row) — "a clean adaptive grid," per the approved
// requirement, distinct from the existing Our Sponsors treatment, which
// this component does not touch, replace, or share markup with.
//
// Always renders all COMMUNITY_PARTNER_SLOT_COUNT (20) positions: the
// occupied slots first, in the position order resolveGridSlots() already
// sorted them into, then "Your Business Here" placeholders
// (fillPartnerSlots, shared with the Partners tab and the public campaign
// page). A placeholder is not a partner — no link, no name, no logo — and
// is the same size as a real card, so the grid reads as available
// inventory rather than missing content. Source order is still the
// definition of "position N": neither the 2-column mobile wrap nor the
// 6-column desktop wrap uses explicit per-item grid placement.
export default function CommunityPartnerGrid({ slots }: { slots: GridSlot[] }) {
  const cells = fillPartnerSlots(slots.map(s => s.partner));

  return (
    <ul
      aria-label="ELF Community Partners"
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
        gap: ".6rem",
      }}
    >
      {cells.map(cell => {
        if (cell.kind === "available") {
          return (
            <li key={cell.key} data-slot="available" style={{ minWidth: 0 }}>
              <div style={{ ...cardStyle, ...availableCardStyle }}>
                <div aria-hidden="true" style={{ ...logoBoxStyle, border: "1px dashed var(--border-app)", color: "var(--text-muted-app)" }}>
                  <Plus size={18} />
                </div>
                <span style={{ ...nameStyle, color: "var(--text-muted-app)", fontWeight: 600 }}>
                  {AVAILABLE_SLOT_LABEL}
                </span>
              </div>
            </li>
          );
        }

        const { partner } = cell;
        const href = partnerHref(partner.website_url);
        const card = (
          <div style={cardStyle}>
            {partner.logo_url ? (
              <img
                src={partner.logo_url}
                alt={partner.business_name}
                style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6 }}
              />
            ) : (
              <div
                style={{
                  ...logoBoxStyle,
                  background: "var(--surface-light-elevated)",
                  fontWeight: 800, fontSize: ".9rem", color: "var(--team-primary)",
                }}
              >
                {partner.business_name.trim()[0]?.toUpperCase() ?? "P"}
              </div>
            )}
            <span style={nameStyle}>{partner.business_name}</span>
          </div>
        );

        // A partner with no website on file still renders (logo/name
        // alone has value); it just isn't wrapped in a link to nowhere —
        // same judgment call as the Partners tab's CommunityPartnersListView.
        return (
          <li key={cell.key} data-slot="partner" style={{ minWidth: 0 }}>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="elf-focus-ring"
                style={{ textDecoration: "none", display: "block", height: "100%" }}
              >
                {card}
              </a>
            ) : card}
          </li>
        );
      })}
    </ul>
  );
}

const cardStyle: CSSProperties = {
  background: "var(--surface-light)",
  border: "1px solid var(--border-app)",
  borderRadius: 12,
  padding: ".6rem .4rem .5rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: ".3rem",
  height: "100%",
  boxSizing: "border-box",
};

// Same box as a real card; only the dashed outline and the fill say
// "available".
const availableCardStyle: CSSProperties = {
  background: "var(--surface-light-elevated)",
  border: "1px dashed var(--border-app)",
};

const logoBoxStyle: CSSProperties = {
  width: 44, height: 44, borderRadius: 6, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const nameStyle: CSSProperties = {
  fontSize: ".58rem", fontWeight: 700, color: "var(--text-secondary-app)",
  textAlign: "center", lineHeight: 1.25, overflowWrap: "anywhere",
  overflow: "hidden", display: "-webkit-box",
  WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
};
