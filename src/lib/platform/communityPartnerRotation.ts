// Phase 2.2D-2 — ELF Community Partner Home Screen advertising grid.
// Pure, deterministic, stateless: resolveGridSlots() is a plain function
// of its inputs and a caller-supplied "tick" — no database write, no
// per-request randomness. The same inputs always produce the exact same
// result, which is what guarantees the mobile Home experience and the
// desktop CoachDashboard render identical resolved positions: page.tsx
// calls this ONCE per request and passes the single resulting array to
// both components, rather than each computing its own.
//
// Fairness guarantee (see the Phase 2.2D-2 architecture audit for the
// full derivation): with A available (unlocked) positions and U eligible
// unlocked partners, stepping the visible window by exactly A ranks each
// tick means every partner appears EXACTLY A/gcd(A,U) times per
// U/gcd(A,U)-tick cycle — a whole number, proven equal, not approximate.
// "Equal scheduled appearances" is a guarantee about this SCHEDULE, not
// about measured real-world impressions (page loads, viewport scrolls,
// ad blockers, etc.) — those are a future, separate concern (impression
// reporting, not built in this phase).

const GRID_SIZE = 20;

export type GridPartnerInput = {
  id:                string;
  business_name:     string;
  short_description: string | null;
  website_url:       string | null;
  logo_url:          string | null;
  locked_position:   number | null;
  // Needed only as a stable, deterministic sort key for the unlocked
  // rotation pool — never display_order (excluded by explicit
  // requirement) and never exposed in the output (see GridPartner below,
  // which omits it). This is the one field in this module's input that
  // would normally be considered admin-only metadata; it never leaves
  // this server-side computation.
  created_at:        string;
};

// The public-safe shape actually handed to the React components — same
// field set as communityPartners.ts's ActiveCommunityPartner, minus
// is_featured (not relevant to the grid) and never including created_at.
export type GridPartner = {
  id:                string;
  business_name:     string;
  short_description: string | null;
  website_url:       string | null;
  logo_url:          string | null;
  locked_position:   number | null;
};

export type GridSlot = { position: number; partner: GridPartner };

function toPublicPartner(p: GridPartnerInput): GridPartner {
  return {
    id:                p.id,
    business_name:     p.business_name,
    short_description: p.short_description,
    website_url:       p.website_url,
    logo_url:           p.logo_url,
    locked_position:    p.locked_position,
  };
}

/** Deterministic UTC day number — the rotation "tick." Advances once per
 *  day, identically for every viewer regardless of timezone, with no
 *  stored state anywhere. Exposed (not inlined into resolveGridSlots) so
 *  tests can exercise resolveGridSlots across many ticks without faking
 *  the system clock. */
export function getUtcDayTick(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 86_400_000);
}

/** Resolves which partner (if any) occupies each advertising position for
 *  a given rotation tick.
 *
 *  `activePartners` must already be is_active=true only (callers — see
 *  listActiveCommunityPartnersForGrid — enforce this at the query level;
 *  this function does not re-check it, and inactive partners must simply
 *  never be passed in here).
 *
 *  `reservedPositions` is the FULL set of locked_position values
 *  currently held by ANY partner — active or inactive — and is deliberately
 *  a separate input rather than derived from `activePartners` alone. An
 *  inactive partner keeps its reservation (approved decision: never give
 *  a reserved position to another partner, never render an empty card to
 *  represent it) — if its position were derived only from the active
 *  list, this function would have no way to know that position is
 *  spoken for, and would incorrectly hand it to a rotating partner. The
 *  caller is responsible for fetching this list across ALL partners
 *  (regardless of is_active) and passing it in alongside the
 *  active-only partner list.
 *
 *  Locked partners (among `activePartners`) always occupy their own
 *  locked_position — this function never reassigns or drops a
 *  reservation, including when its holder would otherwise be eligible
 *  for rotation (it isn't; a locked partner is never part of the
 *  unlocked pool by definition). If two partners somehow share a
 *  locked_position (should be impossible — the database's partial
 *  unique index prevents it among active partners), the first one
 *  encountered wins and the rest are silently treated as
 *  unlocked-pool-ineligible rather than crashing or duplicating a slot.
 *
 *  Only OCCUPIED slots are returned, sorted by position ascending — the
 *  caller renders exactly this list, with no synthesized empty cells,
 *  including for a position reserved by an inactive partner (that
 *  position is simply absent from the result, not rendered empty and
 *  not reassigned). This is what preserves a locked position's true
 *  ordinal meaning (a lock at #1 always sorts first) even when far fewer
 *  than 20 partners are active. */
export function resolveGridSlots(
  activePartners: GridPartnerInput[],
  reservedPositions: number[],
  tick: number,
): GridSlot[] {
  const reserved = new Set(reservedPositions);

  const lockedByPosition = new Map<number, GridPartnerInput>();
  for (const p of activePartners) {
    if (p.locked_position !== null && !lockedByPosition.has(p.locked_position)) {
      lockedByPosition.set(p.locked_position, p);
    }
  }

  const unlocked = activePartners
    .filter(p => p.locked_position === null)
    .slice()
    .sort((a, b) => {
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const availablePositions: number[] = [];
  for (let pos = 1; pos <= GRID_SIZE; pos++) {
    if (!reserved.has(pos)) availablePositions.push(pos);
  }

  const slots: GridSlot[] = [];
  for (const [position, partner] of lockedByPosition) {
    slots.push({ position, partner: toPublicPartner(partner) });
  }

  const totalUnlocked = unlocked.length;
  const windowSize = Math.min(availablePositions.length, totalUnlocked);
  if (windowSize > 0) {
    const startIndex = (tick * availablePositions.length) % totalUnlocked;
    for (let k = 0; k < windowSize; k++) {
      const rank = (startIndex + k) % totalUnlocked;
      slots.push({ position: availablePositions[k], partner: toPublicPartner(unlocked[rank]) });
    }
  }

  return slots.sort((a, b) => a.position - b.position);
}
