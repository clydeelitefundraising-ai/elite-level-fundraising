import type { CSSProperties } from "react";
import type { GridSlot } from "@/lib/platform/communityPartnerRotation";
import { AVAILABLE_SLOT_A11Y_LABEL, fillPartnerSlots, partnerHref } from "@/lib/platform/communityPartnerSlots";

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
// Always renders all COMMUNITY_PARTNER_SLOT_COUNT (21) positions — seven
// full rows of three on a phone: the occupied slots first, in the
// position order resolveGridSlots() already sorted them into, then blank
// positions (fillPartnerSlots, shared with the Partners tab and the public
// campaign page). Source order is still the definition of "position N":
// neither layout uses explicit per-item grid placement.
export default function CommunityPartnerGrid({ slots }: { slots: GridSlot[] }) {
  return <CommunityPartnerTiles partners={slots.map(s => s.partner)} />;
}

type TilePartner = {
  id: string;
  business_name: string;
  website_url: string | null;
  logo_url: string | null;
  is_featured?: boolean;
};

/** The 21-position tile grid itself — also used by the Partners tab
 *  (CommunityPartnersListView), so both Team App surfaces share one
 *  layout. A blank position is the same box as a partner tile (fixed
 *  minimum height, same radius/padding) with nothing visible inside: no
 *  text, no icon, no link — only a screen-reader label. */
export function CommunityPartnerTiles({ partners }: { partners: TilePartner[] }) {
  const cells = fillPartnerSlots(partners);

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
                <span style={visuallyHidden}>{AVAILABLE_SLOT_A11Y_LABEL}</span>
              </div>
            </li>
          );
        }

        const { partner } = cell;
        const href = partnerHref(partner.website_url);
        const card = (
          <div style={partner.is_featured ? { ...cardStyle, borderColor: "#d97706" } : cardStyle}>
            {partner.logo_url ? (
              <img
                src={partner.logo_url}
                alt={partner.business_name}
                style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6 }}
              />
            ) : (
              <div
                style={{
                  width: 44, height: 44, borderRadius: 6, flexShrink: 0,
                  background: "var(--surface-light-elevated)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: ".9rem", color: "var(--team-primary)",
                }}
              >
                {partner.business_name.trim()[0]?.toUpperCase() ?? "P"}
              </div>
            )}
            <span style={nameStyle}>{partner.business_name}</span>
            {partner.is_featured && (
              <span style={{ fontSize: ".5rem", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: ".04em" }}>
                Featured
              </span>
            )}
          </div>
        );

        // A partner with no website on file still renders (logo/name
        // alone has value); it just isn't wrapped in a link to nowhere.
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

// minHeight fixes every tile (real or blank) to the height of a logo plus
// a two-line name, so a row of only blank positions is the same size as a
// row of partners.
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
  minHeight: 96,
  boxSizing: "border-box",
};

// Same box as a partner tile; only the quieter fill says "open".
const availableCardStyle: CSSProperties = {
  background: "var(--surface-light-elevated)",
  position: "relative", // contains the screen-reader label
};

const nameStyle: CSSProperties = {
  fontSize: ".58rem", fontWeight: 700, color: "var(--text-secondary-app)",
  textAlign: "center", lineHeight: 1.25, overflowWrap: "anywhere",
  overflow: "hidden", display: "-webkit-box",
  WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
};

const visuallyHidden: CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0,
};
