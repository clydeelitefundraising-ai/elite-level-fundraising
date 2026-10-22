// Legacy coach login across several teams/seasons (Complete Season Phase 2).
import test from "node:test";
import assert from "node:assert/strict";
import { decideCoachLogin, type LegacyCoachRow } from "./coachLoginMatch.ts";

// A stand-in for teamAuth.hashPassword: deterministic, salt-dependent.
const hash = (password: string, salt: string) => `h(${password}|${salt})`;
const row = (id: string, slug: string, password: string | null, salt = `salt-${id}`): LegacyCoachRow => ({
  id, name: `Coach ${id}`, role: "head_coach", campaign_slug: slug, salt,
  password_hash: password === null ? "unused" : hash(password, salt),
});

test("one team: the right password signs in, a wrong one doesn't", () => {
  const rows = [row("c1", "lions-2027", "pw1")];
  const ok = decideCoachLogin(rows, "pw1", hash);
  assert.equal(ok.kind, "signed_in");
  assert.equal(ok.kind === "signed_in" && ok.coach.campaign_slug, "lions-2027");
  assert.deepEqual(decideCoachLogin(rows, "nope", hash), { kind: "invalid" });
  assert.deepEqual(decideCoachLogin([], "pw1", hash), { kind: "invalid" });
});

test("same email on two teams with different passwords: signs into the team whose password matches — never an arbitrary first row", () => {
  const rows = [row("old", "lions-2027", "first"), row("other", "bears-2027", "second")];
  const a = decideCoachLogin(rows, "first", hash);
  const b = decideCoachLogin(rows, "second", hash);
  assert.equal(a.kind === "signed_in" && a.coach.id, "old");
  assert.equal(b.kind === "signed_in" && b.coach.id, "other");
  // Order doesn't matter.
  const c = decideCoachLogin([...rows].reverse(), "first", hash);
  assert.equal(c.kind === "signed_in" && c.coach.id, "old");
});

test("same password on several teams: nothing is signed in; the coach chooses (each team listed once, sorted)", () => {
  const rows = [row("a", "lions-2027", "same"), row("b", "bears-2027", "same"), row("c", "owls-2027", "different")];
  assert.deepEqual(decideCoachLogin(rows, "same", hash), { kind: "choose_team", campaignSlugs: ["bears-2027", "lions-2027"] });
});

test("account-linked rows (placeholder 'unused', e.g. the copy a season transition makes) never match a typed password", () => {
  const rows = [row("old", "lions-2027", "pw"), row("successor", "lions-2028", null)];
  const d = decideCoachLogin(rows, "pw", hash);
  assert.equal(d.kind === "signed_in" && d.coach.id, "old");
  assert.deepEqual(decideCoachLogin([row("successor", "lions-2028", null)], "unused", hash), { kind: "invalid" });
  // Even if someone typed the literal placeholder and a hash happened to equal it.
  assert.deepEqual(decideCoachLogin([{ ...row("x", "t-2027", null) }], "unused", () => "unused"), { kind: "invalid" });
});

test("malformed rows are ignored, not trusted", () => {
  const rows = [{ id: "x", name: "x", role: "head_coach", campaign_slug: "t" } as unknown as LegacyCoachRow, row("ok", "t-2027", "pw")];
  const d = decideCoachLogin(rows, "pw", hash);
  assert.equal(d.kind === "signed_in" && d.coach.id, "ok");
});
