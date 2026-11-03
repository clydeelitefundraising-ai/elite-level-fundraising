// "Create new school" — the pure rules.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

register(new URL("../testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);
const { checkDuplicates, schoolKey, slugForNewSchool, validateNewSchool } = await import("./schoolCreateLogic.ts");

test("validation: trims, collapses spaces, uppercases the state; strips control characters", () => {
  const v = validateNewSchool({ school_name: "  Apollo\t High\nSchool ", city: " Phoenix ", state: " az " });
  assert.deepEqual(v, { ok: true, value: { school_name: "Apollo High School", city: "Phoenix", state: "AZ" }, acknowledgeSimilar: false });
  assert.equal((validateNewSchool({ school_name: "A", city: "x", state: "AZ" }) as { field: string }).field, "school_name");
  assert.equal((validateNewSchool({ school_name: "Apollo", city: "x", state: "ZZ" }) as { field: string }).field, "state");
  assert.equal((validateNewSchool({ school_name: "Apollo", city: "x".repeat(81), state: "AZ" }) as { field: string }).field, "city");
  assert.equal((validateNewSchool({ school_name: "Apollo", city: "Phoenix", state: "AZ", acknowledgeSimilar: "yes" }) as { acknowledgeSimilar: boolean }).acknowledgeSimilar, false);
});

test("normalized key ignores case, spacing and punctuation — nothing fuzzier", () => {
  assert.equal(schoolKey("Monroe-Valley  High School!"), schoolKey("monroe valley high school"));
  assert.equal(schoolKey("Apollo H.S."), schoolKey("apollo hs"));
  assert.equal(schoolKey("O'Connor High School"), schoolKey("OConnor High School"));
  assert.notEqual(schoolKey("Monroe Valley HS"), schoolKey("Monroe Valley High School"), "no abbreviation guessing");
});

test("duplicate check: same name + place, same name elsewhere, or none; the seed row never matches", () => {
  const schools = [
    { id: "a", slug: "default", school_name: "", city: "", state: "" },
    { id: "b", slug: "lincoln-high-school", school_name: "Lincoln High School", city: "Omaha", state: "NE" },
  ];
  assert.deepEqual(checkDuplicates({ school_name: "lincoln high school", city: "omaha", state: "NE" }, schools), { kind: "duplicate", existing: schools[1] });
  assert.deepEqual(checkDuplicates({ school_name: "Lincoln High School", city: "Lincoln", state: "NE" }, schools), { kind: "similar", similar: [schools[1]] });
  assert.deepEqual(checkDuplicates({ school_name: "Apollo High School", city: "Phoenix", state: "AZ" }, schools), { kind: "none" });
  assert.deepEqual(checkDuplicates({ school_name: "Default", city: "", state: "" }, schools), { kind: "none" });
});

test("slug: the name alone when unique; name + place when the name exists or would be the seed slug", () => {
  const apollo = { school_name: "Apollo High School", city: "Phoenix", state: "AZ" };
  assert.equal(slugForNewSchool(apollo, false), "apollo-high-school");
  assert.equal(slugForNewSchool(apollo, true), "apollo-high-school-phoenix-az");
  assert.equal(slugForNewSchool({ school_name: "Default", city: "Mesa", state: "AZ" }, false), "default-mesa-az");
  assert.ok(slugForNewSchool({ school_name: "x".repeat(120), city: "Phoenix", state: "AZ" }, true).length <= 80);
});
