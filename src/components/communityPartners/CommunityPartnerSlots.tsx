import { ArrowUpRight } from "lucide-react";
import { AVAILABLE_SLOT_A11Y_LABEL, fillPartnerSlots, partnerHref } from "@/lib/platform/communityPartnerSlots";
import styles from "./CommunityPartnerSlots.module.css";

// ELF Community Partners — the one rendering of the 21 advertising
// positions, shared by the Team App Home grid (mobile Home + desktop Coach
// Dashboard), the Partners tab and the public campaign page, so all three
// look and behave identically. Visual reference: "ELF Community Partner
// Advertising Card Design Spec".
//
// Occupied card: white, thin gold outline, the partner's own logo centred
// and contained (never cropped), the business name below, and a small gray
// "Visit ↗" cue only when there is a valid https website — the whole card
// is then the link (new tab, noopener/noreferrer). No website: same card,
// no cue, no link. Blank position: the same square box, light neutral
// fill and light gray border, nothing visible inside — only a
// screen-reader label; never a link.
//
// No hooks or browser APIs: renders in server components (Team App) and
// the public page's client component alike.

export type CommunityPartnerCardData = {
  id: string;
  business_name: string;
  website_url: string | null;
  logo_url: string | null;
  is_featured?: boolean;
};

export default function CommunityPartnerSlots({
  partners,
  variant,
}: {
  partners: readonly CommunityPartnerCardData[] | null | undefined;
  // "app": three columns on phones, auto-fill (~124px) from 640px.
  // "public": follows the campaign column's width — three, four, then five
  // columns (see .publicFrame).
  variant: "app" | "public";
}) {
  const slots = fillPartnerSlots(partners);

  const grid = (
    <ul
      aria-label="ELF Community Partners"
      className={`${styles.grid} ${variant === "app" ? styles.gridApp : styles.gridPublic}`}
    >
      {slots.map(slot => (
        <li key={slot.key} data-slot={slot.kind} className={styles.cell}>
          {slot.kind === "partner"
            ? <PartnerCard partner={slot.partner} />
            : (
              <div className={`${styles.card} ${styles.empty}`}>
                <span className={styles.visuallyHidden}>{AVAILABLE_SLOT_A11Y_LABEL}</span>
              </div>
            )}
        </li>
      ))}
    </ul>
  );

  return variant === "public" ? <div className={styles.publicFrame}>{grid}</div> : grid;
}

function PartnerCard({ partner }: { partner: CommunityPartnerCardData }) {
  const href = partnerHref(partner.website_url);
  const name = partner.business_name.trim();

  const content = (
    <>
      <span className={styles.logoBox}>
        {partner.logo_url ? (
          // The business name is printed right below, so the logo is
          // decorative here (alt="") — an alt would read the name twice.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={partner.logo_url} alt="" className={styles.logo} />
        ) : (
          <span className={styles.initial} aria-hidden="true">{name[0]?.toUpperCase() ?? "P"}</span>
        )}
      </span>
      <span className={styles.name}>{name}</span>
      {partner.is_featured && <span className={styles.featured}>Featured</span>}
      {href && (
        <span className={styles.visit} aria-hidden="true">
          Visit <ArrowUpRight size={11} strokeWidth={2.25} />
        </span>
      )}
    </>
  );

  if (!href) {
    return <div className={`${styles.card} ${styles.partner}`}>{content}</div>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Visit ${name} (opens in a new tab)`}
      className={`${styles.card} ${styles.partner} ${styles.link}`}
    >
      {content}
    </a>
  );
}
