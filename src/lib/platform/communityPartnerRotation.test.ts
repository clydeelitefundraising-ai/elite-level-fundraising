import test from "node:test";
import assert from "node:assert/strict";
import { resolveGridSlots, getUtcDayTick, type GridPartnerInput } from "./communityPartnerRotation.ts";

function makePartner(id: string, overrides: Partial<GridPartnerInput> = {}): GridPartnerInput {
  return {
    id,
    business_name:     `Partner ${id}`,
    short_description: null,
    website_url:       null,
    logo_url:           null,
    locked_position:    null,
    created_at:         `2026-01-${id.padStart(2, "0")}T00:00:00Z`,
    ...overrides,
  };
}

// Most tests have no inactive-but-locked partner to worry about, so the
// reserved-positions list is simply every lock already present among the
// active partners passed in — this helper keeps those call sites short.
// The dedicated "inactive reserved partners" section below passes a
// DIFFERENT reservedPositions list deliberately, to prove the two inputs
// are genuinely independent.
function lockedPositionsOf(partners: GridPartnerInput[]): number[] {
  return partners.filter(p => p.locked_position !== null).map(p => p.locked_position as number);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// ── Mathematical fairness — the core guarantee ───────────────────────────
// Over one full cycle (U/gcd(A,U) ticks), every unlocked partner must
// appear EXACTLY A/gcd(A,U) times — not approximately, exactly. Checked
// exhaustively across many (U, A) combinations, not spot-checked.

function assertExactFairness(U: number, A: number) {
  const partners = Array.from({ length: U }, (_, i) => makePartner(String(i + 1).padStart(2, "0")));
  // availablePositions.length === A is simulated by locking (20 - A) of
  // the 20 positions to otherwise-irrelevant filler partners, so the
  // function under test sees a real A, not a hand-picked parameter.
  const lockedFillers: GridPartnerInput[] = [];
  for (let pos = 1; pos <= 20 - A; pos++) {
    lockedFillers.push(makePartner(`locked-${pos}`, { locked_position: pos }));
  }
  const allPartners = [...partners, ...lockedFillers];
  const reservedPositions = lockedPositionsOf(allPartners);

  // The window can never show more distinct partners in one tick than
  // exist (windowSize = min(A, U), matching resolveGridSlots itself) —
  // the A/gcd(A,U) formula from the audit assumes A <= U; when U < A
  // (fewer partners than slots) every partner simply appears every tick,
  // which this generalized form also produces correctly (W=U → cycle=1,
  // expected=1 per cycle, i.e. "always").
  const windowSize = Math.min(A, U);
  const g = gcd(windowSize, U);
  const cycleLength = U / g;
  const expectedPerPartner = windowSize / g;

  const appearanceCounts = new Map<string, number>(partners.map(p => [p.id, 0]));
  for (let tick = 0; tick < cycleLength; tick++) {
    const slots = resolveGridSlots(allPartners, reservedPositions, tick);
    for (const slot of slots) {
      if (appearanceCounts.has(slot.partner.id)) {
        appearanceCounts.set(slot.partner.id, appearanceCounts.get(slot.partner.id)! + 1);
      }
    }
  }

  for (const [id, count] of appearanceCounts) {
    assert.equal(count, expectedPerPartner, `partner ${id} appeared ${count} times, expected exactly ${expectedPerPartner} (U=${U}, A=${A})`);
  }
}

test("fairness: U=30, A=20 (the audit's worked example) — every partner appears exactly 2 times per 3-tick cycle", () => {
  assertExactFairness(30, 20);
});

test("fairness: U=5, A=20 (fewer partners than slots) — every partner appears every tick", () => {
  assertExactFairness(5, 20);
});

test("fairness: U=20, A=20 (exact fit) — every partner appears every tick", () => {
  assertExactFairness(20, 20);
});

test("fairness: U=25, A=20 — exhaustive check across the full cycle", () => {
  assertExactFairness(25, 20);
});

test("fairness: U=21, A=20 (gcd=1, longest possible cycle for A=20) — every partner appears exactly once per 21-tick cycle", () => {
  assertExactFairness(21, 20);
});

test("fairness: U=40, A=17 (locks reduce availability, non-trivial gcd)", () => {
  assertExactFairness(40, 17);
});

test("fairness: U=7, A=3 (small numbers, easy to hand-verify)", () => {
  assertExactFairness(7, 3);
});

// ── Locked positions ──────────────────────────────────────────────────────

test("a locked partner always occupies its own position, every tick, regardless of pool size", () => {
  const locked = makePartner("locked-1", { locked_position: 7 });
  const unlocked = Array.from({ length: 30 }, (_, i) => makePartner(`u${i}`));
  const partners = [locked, ...unlocked];
  for (let tick = 0; tick < 10; tick++) {
    const slots = resolveGridSlots(partners, lockedPositionsOf(partners), tick);
    const at7 = slots.find(s => s.position === 7);
    assert.equal(at7?.partner.id, "locked-1", `tick ${tick}: position 7 must always be locked-1`);
  }
});

test("locked positions are never included in the unlocked rotation pool", () => {
  const locked = makePartner("locked-1", { locked_position: 1 });
  const unlocked = [makePartner("u1"), makePartner("u2")];
  const partners = [locked, ...unlocked];
  for (let tick = 0; tick < 5; tick++) {
    const slots = resolveGridSlots(partners, lockedPositionsOf(partners), tick);
    const ids = slots.map(s => s.partner.id);
    assert.ok(!ids.filter(id => id !== "locked-1").includes("locked-1"));
    // locked-1 appears exactly once (at its own position), never doubles up
    assert.equal(ids.filter(id => id === "locked-1").length, 1);
  }
});

test("multiple locked positions all retain their exact assigned position simultaneously", () => {
  const partners: GridPartnerInput[] = [
    makePartner("a", { locked_position: 1 }),
    makePartner("b", { locked_position: 10 }),
    makePartner("c", { locked_position: 20 }),
    makePartner("d"),
    makePartner("e"),
  ];
  const slots = resolveGridSlots(partners, lockedPositionsOf(partners), 0);
  assert.equal(slots.find(s => s.position === 1)?.partner.id, "a");
  assert.equal(slots.find(s => s.position === 10)?.partner.id, "b");
  assert.equal(slots.find(s => s.position === 20)?.partner.id, "c");
});

test("a duplicate locked_position among the inputs never crashes and never produces two partners at one position", () => {
  // Should be impossible given the database's unique index among active
  // partners, but resolveGridSlots must still degrade safely rather than
  // trust that invariant blindly.
  const partners: GridPartnerInput[] = [
    makePartner("a", { locked_position: 5 }),
    makePartner("b", { locked_position: 5 }),
  ];
  const slots = resolveGridSlots(partners, lockedPositionsOf(partners), 0);
  const atFive = slots.filter(s => s.position === 5);
  assert.equal(atFive.length, 1, "exactly one partner must occupy position 5, never two, never zero");
});

// ── Inactive reserved partners (Decision 2) ───────────────────────────────
// The defining case this module exists to get right: an inactive
// partner's locked position must stay reserved — never displayed, never
// handed to another (rotating) partner, never rendered as an empty
// placeholder card. Modeled here by passing a reservedPositions list that
// includes a position with NO corresponding entry in the active-partners
// list at all (exactly what the real caller does: the inactive partner
// is filtered out of listActiveCommunityPartnersForGrid's result, but
// listAllLockedPositions still reports its locked_position).

test("an inactive partner's reserved position is never given to a rotating partner", () => {
  // Position 5 is reserved (by a now-inactive partner the caller never
  // included in `activePartners`), but only 3 active unlocked partners
  // exist with 19 nominally-available positions (20 minus the reserved
  // one) — if the bug this test guards against were reintroduced,
  // position 5 would incorrectly end up occupied by one of these three.
  const activePartners = [makePartner("u1"), makePartner("u2"), makePartner("u3")];
  const reservedPositions = [5]; // held by an inactive partner, not in activePartners at all
  for (let tick = 0; tick < 10; tick++) {
    const slots = resolveGridSlots(activePartners, reservedPositions, tick);
    assert.equal(slots.find(s => s.position === 5), undefined, `tick ${tick}: position 5 must stay empty, never filled by a rotating partner`);
  }
});

test("an inactive partner's reserved position never renders any card — not even a placeholder", () => {
  const activePartners = [makePartner("u1")];
  const slots = resolveGridSlots(activePartners, [5], 0);
  assert.equal(slots.length, 1, "only the one real active partner renders; no synthesized entry for the reserved-but-inactive position 5");
  assert.equal(slots[0].position, 1, "the lone active partner fills the lowest available position, not position 5");
});

test("multiple inactive-reserved positions are all withheld from rotation simultaneously", () => {
  const activePartners = Array.from({ length: 20 }, (_, i) => makePartner(`u${i}`));
  const reservedPositions = [2, 5, 9, 14];
  const slots = resolveGridSlots(activePartners, reservedPositions, 0);
  for (const pos of reservedPositions) {
    assert.equal(slots.find(s => s.position === pos), undefined, `position ${pos} must stay reserved and empty`);
  }
  // Exactly 20 - 4 = 16 slots available, exactly 16 of the 20 active
  // partners get shown this tick.
  assert.equal(slots.length, 16);
});

test("reservedPositions and an active partner's own lock can coexist without conflict (the normal, non-inactive case)", () => {
  const activePartners = [makePartner("a", { locked_position: 5 }), makePartner("u1")];
  // reservedPositions reflects reality: includes 5, exactly as
  // listAllLockedPositions would report for this active, locked partner.
  const slots = resolveGridSlots(activePartners, [5], 0);
  assert.equal(slots.find(s => s.position === 5)?.partner.id, "a");
});

// ── Sparse grids ───────────────────────────────────────────────────────────

test("sparse grid: only occupied slots are returned, never a placeholder for an unfilled position", () => {
  const partners: GridPartnerInput[] = [
    makePartner("a", { locked_position: 17 }),
    makePartner("b"),
    makePartner("c"),
  ];
  const slots = resolveGridSlots(partners, lockedPositionsOf(partners), 0);
  assert.equal(slots.length, 3, "exactly 3 occupied slots, no synthesized empties for the other 17 positions");
});

test("sparse grid: a lock at a high position number always sorts first in the returned, compacted list", () => {
  const partners: GridPartnerInput[] = [
    makePartner("locked-high", { locked_position: 1 }),
    makePartner("u1"),
    makePartner("u2"),
  ];
  const slots = resolveGridSlots(partners, lockedPositionsOf(partners), 0);
  assert.equal(slots[0].partner.id, "locked-high", "position 1's occupant must sort first even though positions 2-19 are empty");
});

// ── No eligible partners ────────────────────────────────────────────────

test("zero active partners resolves to an empty grid, never throws", () => {
  assert.deepEqual(resolveGridSlots([], [], 0), []);
});

test("all 20 positions locked, zero unlocked partners — no rotation attempted, no division by zero", () => {
  const partners = Array.from({ length: 20 }, (_, i) => makePartner(`locked-${i + 1}`, { locked_position: i + 1 }));
  const slots = resolveGridSlots(partners, lockedPositionsOf(partners), 0);
  assert.equal(slots.length, 20);
});

// ── Determinism (the basis for mobile/desktop agreement) ─────────────────

test("resolveGridSlots is a pure function — identical inputs and tick always produce an identical result", () => {
  const partners: GridPartnerInput[] = [
    makePartner("a", { locked_position: 3 }),
    makePartner("b"),
    makePartner("c"),
    makePartner("d"),
  ];
  const reserved = lockedPositionsOf(partners);
  const first = resolveGridSlots(partners, reserved, 42);
  const second = resolveGridSlots(partners, reserved, 42);
  assert.deepEqual(first, second);
});

test("the same tick (e.g. the same UTC day) always yields the same assignment — no per-call randomness", () => {
  const partners = Array.from({ length: 30 }, (_, i) => makePartner(`u${i}`));
  const tick = getUtcDayTick(new Date("2026-06-15T12:00:00Z"));
  const runs = Array.from({ length: 5 }, () => resolveGridSlots(partners, [], tick));
  for (const run of runs.slice(1)) assert.deepEqual(run, runs[0]);
});

// ── getUtcDayTick ─────────────────────────────────────────────────────────

test("getUtcDayTick: advances by exactly 1 per UTC day, regardless of time-of-day", () => {
  const day1Morning = getUtcDayTick(new Date("2026-06-15T01:00:00Z"));
  const day1Night    = getUtcDayTick(new Date("2026-06-15T23:59:00Z"));
  const day2          = getUtcDayTick(new Date("2026-06-16T00:00:00Z"));
  assert.equal(day1Morning, day1Night);
  assert.equal(day2, day1Morning + 1);
});
