import { ArrowUpRight, Plus } from "lucide-react";
import type { ActiveCommunityPartner } from "@/lib/platform/communityPartners";
import { AVAILABLE_SLOT_LABEL, fillPartnerSlots, partnerHref } from "@/lib/platform/communityPartnerSlots";

// ── Logo placeholder ──────────────────────────────────────────────────────
// Same hashed-color-initial approach as SponsorsView.tsx's LogoPlaceholder
// — not shared/imported from there because that one takes a Team Sponsor
// name prop shape; duplicating ~15 lines here is simpler than extracting a
// cross-cutting shared util for a single reused snippet (same judgment
// call SponsorsView itself makes for PublicCard vs CoachCard).
function LogoPlaceholder({ name, size }: { name: string; size: number }) {
  const initial = name.trim()[0]?.toUpperCase() ?? "P";
  const palette = ["#0b2044", "#4c1d95", "#065f46", "#7c2d12", "#0c4a6e", "#92400e"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  const bg = palette[hash % palette.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.38, color: "#fff", flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

// ── Partner card ──────────────────────────────────────────────────────────
// The whole card IS the link — target="_blank" + rel="noopener noreferrer"
// is the same safe-external-link pattern SponsorsView.tsx's PublicCard
// already uses for team sponsors: noopener prevents the opened partner
// site from getting a handle back to this window (tabnabbing), noreferrer
// withholds the Referer header. website_url is already validated
// server-side as a well-formed https:// URL at creation/edit time
// (communityPartners.ts's isValidHttpsUrl); partnerHref() re-applies the
// same https-only rule so a malformed stored value renders unlinked
// rather than as a broken link.
function PartnerCard({ partner }: { partner: ActiveCommunityPartner }) {
  const href = partnerHref(partner.website_url);
  const card = (
    <div style={{
      display: "flex", gap: ".75rem", alignItems: "center",
      background: "var(--surface-light)", borderRadius: "var(--radius-lg)",
      padding: ".85rem", border: "1px solid var(--border-app)",
      height: "100%", boxSizing: "border-box",
      borderLeft: partner.is_featured ? "3px solid #b45309" : "3px solid transparent",
    }}>
      {partner.logo_url ? (
        <img
          src={partner.logo_url}
          alt={partner.business_name}
          style={{ width: 44, height: 44, borderRadius: 8, objectFit: "contain", flexShrink: 0, background: "#f9fafb", border: "1px solid #e5e7eb" }}
        />
      ) : (
        <LogoPlaceholder name={partner.business_name} size={44} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap", marginBottom: ".15rem" }}>
          <span style={{ fontWeight: 700, fontSize: ".88rem", color: "var(--text-primary-app)", overflowWrap: "anywhere" }}>
            {partner.business_name}
          </span>
          {partner.is_featured && (
            <span style={{
              fontSize: ".58rem", fontWeight: 700, color: "#92400e", background: "#fef3c7",
              borderRadius: 100, padding: ".1rem .45rem", textTransform: "uppercase", letterSpacing: ".04em",
            }}>
              Featured
            </span>
          )}
        </div>
        {partner.short_description && (
          <div style={{ fontSize: ".75rem", color: "var(--text-secondary-app)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {partner.short_description}
          </div>
        )}
      </div>

      {href && <ArrowUpRight size={15} style={{ color: "var(--text-muted-app)", flexShrink: 0 }} />}
    </div>
  );

  // A partner with no website on file is still shown (logo/name/description
  // have value on their own) — just not wrapped in a link to nowhere.
  if (!href) return card;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="elf-focus-ring"
      style={{ display: "block", textDecoration: "none", height: "100%" }}
    >
      {card}
    </a>
  );
}

// ── Available position ────────────────────────────────────────────────────
// One of the 20 advertising positions no partner fills. The same box as a
// PartnerCard (44px mark + one line of text) so real and available cards
// line up; a dashed outline and a quieter fill say "available" without
// looking broken. Not a partner and not a link — there is no inquiry
// workflow to send anyone to yet.
function AvailableCard() {
  return (
    <div style={{
      display: "flex", gap: ".75rem", alignItems: "center",
      background: "var(--surface-light-elevated)", borderRadius: "var(--radius-lg)",
      // +2px left padding stands in for a PartnerCard's 3px left accent
      // border, so the marks of real and available cards line up.
      padding: ".85rem", paddingLeft: "calc(.85rem + 2px)", border: "1px dashed var(--border-app)",
      height: "100%", boxSizing: "border-box",
    }}>
      <div aria-hidden="true" style={{
        width: 44, height: 44, borderRadius: 8, flexShrink: 0,
        border: "1px dashed var(--border-app)", color: "var(--text-muted-app)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Plus size={18} />
      </div>
      <span style={{ fontWeight: 600, fontSize: ".85rem", color: "var(--text-muted-app)" }}>
        {AVAILABLE_SLOT_LABEL}
      </span>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────
// Server-rendered content only — no client state. page.tsx has already
// resolved both "is advertising on for this school" and "what are the
// active partners," so this component's only job is to render exactly
// what it was handed: all 20 advertising positions (fillPartnerSlots,
// shared with the Home grid and the public campaign page) — the active
// partners first in their existing display_order, then "Your Business
// Here" placeholders. More than 20 active partners are all shown, with no
// placeholders. With no partners yet, the explanatory line the old empty
// state carried stays above the 20 open positions.
export default function CommunityPartnersListView({
  partners,
}: {
  partners: ActiveCommunityPartner[];
}) {
  const slots = fillPartnerSlots(partners);
  const partnerCount = slots.filter(s => s.kind === "partner").length;

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

      <ul
        aria-label="ELF Community Partners"
        style={{
          listStyle: "none", margin: 0, padding: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
          gap: ".55rem",
        }}
      >
        {slots.map(slot => (
          <li key={slot.key} data-slot={slot.kind} style={{ minWidth: 0 }}>
            {slot.kind === "partner" ? <PartnerCard partner={slot.partner} /> : <AvailableCard />}
          </li>
        ))}
      </ul>
    </div>
  );
}
