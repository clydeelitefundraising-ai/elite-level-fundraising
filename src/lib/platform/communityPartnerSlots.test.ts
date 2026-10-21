import test from "node:test";
import assert from "node:assert/strict";
import {
  AVAILABLE_SLOT_LABEL,
  COMMUNITY_PARTNER_SLOT_COUNT,
  fillPartnerSlots,
  partnerHref,
  type PartnerSlot,
} from "./communityPartnerSlots.ts";

type P = { id: string; business_name: string; website_url: string | null };

function partners(n: number): P[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, business_name: `Business ${i + 1}`, website_url: `https://b${i + 1}.example.com` }));
}

const real = (slots: PartnerSlot<P>[]) => slots.filter(s => s.kind === "partner");
const open = (slots: PartnerSlot<P>[]) => slots.filter(s => s.kind === "available");

test("20 positions, 'Your Business Here' label", () => {
  assert.equal(COMMUNITY_PARTNER_SLOT_COUNT, 20);
  assert.equal(AVAILABLE_SLOT_LABEL, "Your Business Here");
});

for (const [count, expectedReal, expectedOpen] of [[0, 0, 20], [1, 1, 19], [5, 5, 15], [19, 19, 1], [20, 20, 0]] as const) {
  test(`${count} partners -> ${expectedReal} real + ${expectedOpen} placeholders = 20 positions`, () => {
    const slots = fillPartnerSlots(partners(count));
    assert.equal(slots.length, 20);
    assert.equal(real(slots).length, expectedReal);
    assert.equal(open(slots).length, expectedOpen);
  });
}

test("more than 20 partners: every partner is kept, in order, with no placeholders (nothing discarded)", () => {
  const input = partners(23);
  const slots = fillPartnerSlots(input);
  assert.equal(slots.length, 23);
  assert.equal(open(slots).length, 0);
  assert.deepEqual(slots.map(s => s.kind === "partner" && s.partner.id), input.map(p => p.id));
});

test("real partners come first, in the order given; placeholders follow; positions run 1..20", () => {
  const input = [partners(3)[2], partners(3)[0], partners(3)[1]];
  const slots = fillPartnerSlots(input);
  assert.deepEqual(slots.slice(0, 3).map(s => s.kind === "partner" && s.partner.id), ["p3", "p1", "p2"]);
  assert.ok(slots.slice(3).every(s => s.kind === "available"));
  assert.deepEqual(slots.map(s => s.position), Array.from({ length: 20 }, (_, i) => i + 1));
});

test("the same partner object is passed through untouched (links, logos preserved)", () => {
  const p = { id: "x", business_name: "X Co", website_url: "https://x.example.com", logo_url: "https://cdn.example.com/x.png" };
  const [first] = fillPartnerSlots([p]);
  assert.equal(first.kind === "partner" && first.partner, p);
});

test("never duplicates a partner to fill space: a repeated id is shown once", () => {
  const [a, b] = partners(2);
  const slots = fillPartnerSlots([a, b, a]);
  assert.deepEqual(real(slots).map(s => s.kind === "partner" && s.partner.id), ["p1", "p2"]);
  assert.equal(open(slots).length, 18);
});

test("keys are unique and stable: partner keys follow the id, placeholder keys the position", () => {
  const first = fillPartnerSlots(partners(2));
  const again = fillPartnerSlots(partners(2));
  const keys = first.map(s => s.key);
  assert.equal(new Set(keys).size, 20);
  assert.deepEqual(keys, again.map(s => s.key));
  assert.equal(first[0].key, "partner-p1");
  assert.equal(first[2].key, "available-3");
});

test("placeholders carry no partner data at all (no id, name, link or logo)", () => {
  for (const s of open(fillPartnerSlots(partners(1)))) {
    assert.deepEqual(Object.keys(s).sort(), ["key", "kind", "position"]);
  }
});

test("malformed rows (missing/blank id or name, non-objects) are skipped, not rendered or thrown on", () => {
  const input = [
    null, undefined, "nope", { id: "", business_name: "No id" }, { id: "n1", business_name: "   " },
    { id: "n2" }, { business_name: "No id at all" }, { id: "ok", business_name: "Real Co", website_url: null },
  ] as unknown as P[];
  const slots = fillPartnerSlots(input);
  assert.deepEqual(real(slots).map(s => s.kind === "partner" && s.partner.id), ["ok"]);
  assert.equal(slots.length, 20);
});

test("null / undefined partner lists give 20 placeholders", () => {
  assert.equal(open(fillPartnerSlots(null)).length, 20);
  assert.equal(open(fillPartnerSlots(undefined)).length, 20);
});

test("partnerHref: only well-formed https URLs are linked", () => {
  assert.equal(partnerHref("https://acme.example.com/path?q=1"), "https://acme.example.com/path?q=1");
  assert.equal(partnerHref("  https://acme.example.com  "), "https://acme.example.com");
  for (const bad of [null, undefined, "", "   ", "http://acme.example.com", "javascript:alert(1)", "acme.example.com", "not a url"]) {
    assert.equal(partnerHref(bad), null, String(bad));
  }
});
