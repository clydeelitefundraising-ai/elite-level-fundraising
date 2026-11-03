// New Campaign wizard — school defaults: which fields, manual edits kept,
// switching schools, neutral fallbacks, Community Partner visibility.
import test from "node:test";
import assert from "node:assert/strict";
import {
  INHERITABLE_FIELDS, applySchoolDefaults, keptEdits, partnerVisibility, partnerVisibilityText, schoolProvided,
  type InheritableValues, type SchoolDefaultsRow,
} from "./campaignSchoolDefaults.ts";

const NEUTRAL: InheritableValues = {
  school_name: "", city: "", state: "", mascot: "",
  primary_color: "#1B4FA8", secondary_color: "#C4A35A", logo_url: "",
  goal_dollars: "", default_athlete_goal_dollars: "", contact_goal: "10",
  layout_variant: "classic", show_donation_card: true, show_leaderboard: true, show_program_identity: true,
  show_share_section: true, show_fund_uses: true, show_recent_donations: true, show_sponsors: true,
};

const MONROE: SchoolDefaultsRow & Record<string, unknown> = {
  school_name: "Monroe Valley High School", city: "Phoenix", state: "az", nickname: "Falcons",
  primary_color: "#0A3D62", secondary_color: "#F6B93B", logo_url: "https://cdn.example/monroe.png",
  default_layout: "premium", default_fundraising_goal_cents: 2500000, default_athlete_goal_cents: 50000, default_contact_goal: 15,
  default_show_leaderboard: false, default_show_program_identity: true, default_show_share_section: true,
  default_show_fund_uses: false, default_show_recent_donations: true, default_show_sponsors: true, default_show_donation_card: true,
  show_community_partners: true, show_community_partners_public: false,
  // School facts that must never become campaign values:
  address: "1 School Rd", zip: "85001", website: "https://monroe.example", short_description: "About Monroe",
  athletic_director: "Pat AD", athletic_director_email: "ad@monroe.example", athletic_director_phone: "555",
  default_team_photo_url: "https://cdn.example/team.jpg", default_campaign_length_days: 45,
};

const BARE: SchoolDefaultsRow = {
  school_name: "Apollo High School", city: "", state: "", nickname: "", primary_color: "", secondary_color: "not-a-color",
  logo_url: "", default_layout: "", default_fundraising_goal_cents: 0, default_athlete_goal_cents: 0, default_contact_goal: 0,
};

const blank = (): InheritableValues & { sport_name: string; coach_email: string } => ({ ...NEUTRAL, sport_name: "Track", coach_email: "c@x.test" });

test("only the approved fields are inherited — school facts never become campaign values", () => {
  const got = schoolProvided(MONROE);
  assert.deepEqual(Object.keys(got).sort(), [...INHERITABLE_FIELDS].sort());
  assert.equal(got.state, "AZ");
  assert.equal(got.mascot, "Falcons", "the school's Nickname / Mascot");
  assert.equal(got.goal_dollars, "25000");
  assert.equal(got.default_athlete_goal_dollars, "500");
  const all = JSON.stringify(got);
  for (const leaked of ["1 School Rd", "85001", "monroe.example", "About Monroe", "Pat AD", "team.jpg", "45"]) assert.ok(!all.includes(leaked), leaked);
});

test("a school with nothing configured falls back to neutral ELF values, field by field", () => {
  const { values, inherited } = applySchoolDefaults(blank(), new Set(), BARE, NEUTRAL);
  assert.deepEqual([...inherited], ["school_name"], "only the name is configured");
  assert.equal(values.school_name, "Apollo High School");
  assert.equal(values.primary_color, "#1B4FA8");
  assert.equal(values.secondary_color, "#C4A35A", "an invalid stored color is not used");
  assert.equal(values.goal_dollars, "");
  assert.equal(values.contact_goal, "10");
  assert.equal(values.layout_variant, "classic");
  assert.equal(values.sport_name, "Track", "non-school fields untouched");
});

test("selecting a school fills only untouched fields; administrator edits are never overwritten", () => {
  const start = { ...blank(), primary_color: "#111111", goal_dollars: "9000", mascot: "Hawks" };
  const touched = new Set(["primary_color", "goal_dollars", "mascot", "sport_name"]);
  const { values, inherited } = applySchoolDefaults(start, touched, MONROE, NEUTRAL);
  assert.equal(values.primary_color, "#111111");
  assert.equal(values.goal_dollars, "9000");
  assert.equal(values.mascot, "Hawks");
  assert.equal(values.secondary_color, "#F6B93B");
  assert.equal(values.show_leaderboard, false);
  assert.ok(!inherited.has("primary_color") && !inherited.has("goal_dollars") && !inherited.has("mascot"));
  assert.ok(inherited.has("secondary_color") && inherited.has("layout_variant"));
  assert.deepEqual(keptEdits(touched), ["mascot", "primary_color", "goal_dollars"]);
});

test("switching schools never carries the previous school's values into fields the new school lacks", () => {
  const first = applySchoolDefaults(blank(), new Set(), MONROE, NEUTRAL).values;
  assert.equal(first.logo_url, "https://cdn.example/monroe.png");
  const touched = new Set(["goal_dollars"]);
  const edited = { ...first, goal_dollars: "1234" };
  const { values, inherited } = applySchoolDefaults(edited, touched, BARE, NEUTRAL);
  assert.equal(values.school_name, "Apollo High School");
  assert.equal(values.logo_url, "", "Monroe's logo is not kept for Apollo");
  assert.equal(values.primary_color, "#1B4FA8");
  assert.equal(values.city, "");
  assert.equal(values.mascot, "");
  assert.equal(values.layout_variant, "classic");
  assert.equal(values.show_leaderboard, true);
  assert.equal(values.goal_dollars, "1234", "the edit survives the switch");
  assert.ok(!inherited.has("logo_url"));
});

test("a CRM-suggested school name is a suggestion: selecting the school replaces it unless edited", () => {
  const seeded = { ...blank(), school_name: "Monroe Valley HS" };
  assert.equal(applySchoolDefaults(seeded, new Set(), MONROE, NEUTRAL).values.school_name, "Monroe Valley High School");
  assert.equal(applySchoolDefaults(seeded, new Set(["school_name"]), MONROE, NEUTRAL).values.school_name, "Monroe Valley HS");
});

test("Community Partner visibility follows the school's own advertising settings", () => {
  assert.deepEqual(partnerVisibility(MONROE), { teamApp: true, publicPage: false });
  assert.equal(partnerVisibilityText(MONROE), "Team App shown · Public page hidden");
  assert.equal(partnerVisibilityText(BARE), "Team App hidden · Public page hidden");
  assert.equal(partnerVisibilityText(null), "Team App hidden · Public page hidden");
});
