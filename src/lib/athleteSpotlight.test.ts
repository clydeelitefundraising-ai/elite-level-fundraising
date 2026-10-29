import test from "node:test";
import assert from "node:assert/strict";
import {
  athletePhotoSrc, athleteSupportMessage, firstName, isAthleteId, resolveSpotlightAthlete, spotlightGrade,
} from "./athleteSpotlight.ts";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const roster = [
  { id: U(1), name: "Hannah Gray", class_year: "Junior" },
  { id: U(2), name: "Hannah Gray", class_year: "Senior" }, // same name, different athlete
  { id: "abcdef12-0000-4000-8000-000000000003", name: "Lee Lower", class_year: "Freshman" },
];

test("grade: the real grades are shown; Other, blank and non-standard values are omitted", () => {
  for (const g of ["6th Grade", "7th Grade", "8th Grade", "Freshman", "Sophomore", "Junior", "Senior"]) assert.equal(spotlightGrade(g), g);
  for (const [raw, shown] of [[" junior ", "Junior"], ["FRESHMAN", "Freshman"], ["senior", "Senior"], ["8th  grade", "8th Grade"]]) {
    assert.equal(spotlightGrade(raw), shown, `case/spacing variant ${JSON.stringify(raw)}`);
  }
  for (const g of ["Other", " other ", "", "   ", null, undefined, "RS Sophomore", "Jr", "2027"]) assert.equal(spotlightGrade(g), null, String(g));
});

test("spotlight athlete: exact id match on this campaign's roster only", () => {
  assert.equal(resolveSpotlightAthlete(U(2), roster)?.class_year, "Senior", "matched by id, never by name");
  assert.equal(resolveSpotlightAthlete("ABCDEF12-0000-4000-8000-000000000003", roster), null, "ids are exact");
  for (const bad of [U(9), "", null, undefined, "not-a-uuid", `${U(1)} `, `${U(1)}&x=1`]) {
    assert.equal(resolveSpotlightAthlete(bad, roster), null, String(bad));
  }
  assert.equal(resolveSpotlightAthlete(U(1), []), null, "roster not loaded / other team's athlete → general page");
});

test("isAthleteId", () => {
  assert.ok(isAthleteId(U(1)));
  assert.ok(!isAthleteId("abc") && !isAthleteId(null) && !isAthleteId(""));
});

test("photo src is the public photo route, never a storage URL", () => {
  assert.equal(athletePhotoSrc("lions-track-2027", U(1)), `/api/campaign-photo/lions-track-2027/${U(1)}`);
  assert.equal(athletePhotoSrc("a b", U(1)), `/api/campaign-photo/a%20b/${U(1)}`);
});

test("support message: first name, team name, no gendered pronouns", () => {
  const msg = athleteSupportMessage("Hannah Gray", "Falcons");
  assert.equal(msg, "Help Hannah and the Falcons reach their fundraising goals this season. Your support makes a direct impact on Hannah and the entire team.");
  assert.ok(!/\b(he|she|his|her|him)\b/i.test(msg));
  assert.equal(firstName("  Jo   Junior "), "Jo");
});
