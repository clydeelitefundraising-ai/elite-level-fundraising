import type { GridSlot } from "@/lib/platform/communityPartnerRotation";

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
// Renders ONLY occupied slots, already sorted by position ascending by
// resolveGridSlots() — no synthesized empty cells for the positions
// nothing currently fills. Source order IS the definition of "position
// N" here: the Nth slot in this array is the Nth card in the DOM, first
// in both a 2-column mobile wrap and a 6-column desktop wrap alike,
// because neither layout uses explicit per-item grid placement — see the
// Phase 2.2D-2 audit's "definition of a reserved position" section.
export default function CommunityPartnerGrid({ slots }: { slots: GridSlot[] }) {
  if (slots.length === 0) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
        gap: ".6rem",
      }}
    >
      {slots.map(({ position, partner }) => {
        const card = (
          <div
            style={{
              background: "var(--surface-light)",
              border: "1px solid var(--border-app)",
              borderRadius: 12,
              padding: ".6rem .4rem .5rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: ".3rem",
              height: "100%",
            }}
          >
            {partner.logo_url ? (
              <img
                src={partner.logo_url}
                alt={partner.business_name}
                style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6 }}
              />
            ) : (
              <div
                style={{
                  width: 44, height: 44, borderRadius: 6,
                  background: "var(--surface-light-elevated)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: ".9rem", color: "var(--team-primary)",
                }}
              >
                {partner.business_name.trim()[0]?.toUpperCase() ?? "P"}
              </div>
            )}
            <span
              style={{
                fontSize: ".58rem", fontWeight: 700, color: "var(--text-secondary-app)",
                textAlign: "center", lineHeight: 1.25,
                overflow: "hidden", display: "-webkit-box",
                WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
              }}
            >
              {partner.business_name}
            </span>
          </div>
        );

        // A partner with no website on file still renders (logo/name
        // alone has value); it just isn't wrapped in a link to nowhere —
        // same judgment call as the Partners tab's CommunityPartnersListView.
        if (!partner.website_url) {
          return <div key={`${position}-${partner.id}`}>{card}</div>;
        }

        return (
          <a
            key={`${position}-${partner.id}`}
            href={partner.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="elf-focus-ring"
            style={{ textDecoration: "none", display: "block" }}
          >
            {card}
          </a>
        );
      })}
    </div>
  );
}
