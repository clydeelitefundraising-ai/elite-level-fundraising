// ELF Community Partners — the 20 visible advertising positions.
//
// Presentation only. Every ELF Community Partners section (Team App Home
// grid, Team App Partners tab, public campaign page) shows exactly
// COMMUNITY_PARTNER_SLOT_COUNT positions: the real partners it was handed,
// in the order it was handed them (each surface keeps its own existing
// ordering rule — resolveGridSlots() position order for the Home grid and
// the public page, display_order for the Partners tab), followed by
// "Your Business Here" placeholders for the positions nothing fills.
//
// Placeholders are never partner records: no id, no name, no link, no
// logo — nothing is written anywhere and nothing is duplicated to fill
// space. More than 20 real partners are all kept (no placeholders, no
// truncation); whether a surface can ever receive more than 20 is that
// surface's own rule (resolveGridSlots() never returns more than 20).
//
// Client-safe: no server imports, so the public campaign page's client
// component can use it as well as the server-rendered Team App views.

export const COMMUNITY_PARTNER_SLOT_COUNT = 20;

export type PartnerSlot<P> =
  | { kind: "partner"; key: string; position: number; partner: P }
  | { kind: "available"; key: string; position: number };

type PartnerLike = { id: string; business_name: string };

/** A partner is displayable only with a non-blank id and business name —
 *  anything else (a malformed API row) is skipped rather than rendered as
 *  a blank card or crashing the section. */
function isDisplayable(p: unknown): p is PartnerLike {
  if (!p || typeof p !== "object") return false;
  const { id, business_name } = p as Record<string, unknown>;
  return typeof id === "string" && id.trim() !== "" && typeof business_name === "string" && business_name.trim() !== "";
}

/** Real partners first (input order, first occurrence of each id only),
 *  then placeholders up to `total`. Keys are stable: a partner's key is
 *  its id; a placeholder's key is its position number. */
export function fillPartnerSlots<P extends PartnerLike>(
  partners: readonly P[] | null | undefined,
  total: number = COMMUNITY_PARTNER_SLOT_COUNT,
): PartnerSlot<P>[] {
  const seen = new Set<string>();
  const slots: PartnerSlot<P>[] = [];
  for (const p of partners ?? []) {
    if (!isDisplayable(p) || seen.has(p.id)) continue;
    seen.add(p.id);
    slots.push({ kind: "partner", key: `partner-${p.id}`, position: slots.length + 1, partner: p });
  }
  for (let position = slots.length + 1; position <= total; position++) {
    slots.push({ kind: "available", key: `available-${position}`, position });
  }
  return slots;
}

/** The partner's website as a link target, or null — only a well-formed
 *  https:// URL (the rule communityPartners.ts enforces on save) is ever
 *  linked, so a malformed stored value renders an unlinked card instead
 *  of a broken link. */
export function partnerHref(websiteUrl: string | null | undefined): string | null {
  if (typeof websiteUrl !== "string") return null;
  const trimmed = websiteUrl.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

export const AVAILABLE_SLOT_LABEL = "Your Business Here";
