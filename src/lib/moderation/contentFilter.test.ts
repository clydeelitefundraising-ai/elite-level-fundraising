import test from "node:test";
import assert from "node:assert/strict";
import { checkContent } from "./contentFilter.ts";

test("plain prohibited term is rejected", () => {
  const result = checkContent("you are a nigger");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.message, "This message contains content that isn't allowed. Please edit it and try again.");
  }
});

test("the rejection message never echoes the matched term", () => {
  const result = checkContent("faggot");
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(!result.message.toLowerCase().includes("faggot"));
});

test("simple punctuation obfuscation is caught (dots/spaces/dashes)", () => {
  assert.equal(checkContent("f.a.g.g.o.t").ok, false);
  assert.equal(checkContent("f a g g o t").ok, false);
  assert.equal(checkContent("f-a-g-g-o-t").ok, false);
});

test("simple leetspeak substitution is caught", () => {
  assert.equal(checkContent("f4gg0t").ok, false);
  assert.equal(checkContent("n1gg3r").ok, false);
});

test("ordinary sports/team communication is allowed", () => {
  const messages = [
    "Great practice today team, see everyone at 6am tomorrow!",
    "Don't forget your cleats for Saturday's meet.",
    "Coach said we're doing hill sprints this week, get ready.",
    "That was a hard-fought game, proud of everyone.",
    "Can someone bring extra water bottles to practice?",
  ];
  for (const m of messages) {
    const result = checkContent(m);
    assert.equal(result.ok, true, `expected "${m}" to be allowed`);
  }
});

test("mild profanity alone is NOT flagged — this is not a general profanity filter", () => {
  assert.equal(checkContent("damn, we lost by one point").ok, true);
  assert.equal(checkContent("that referee call was crap").ok, true);
  assert.equal(checkContent("what the hell happened out there").ok, true);
});

test("legitimate medical/safety terminology is not flagged", () => {
  assert.equal(checkContent("Athlete reported an asthma attack during warmups, sent to trainer.").ok, true);
  assert.equal(checkContent("Please bring an EpiPen in case of an allergic reaction.").ok, true);
});

test("empty and whitespace-only strings are allowed (length/emptiness is a separate validation concern)", () => {
  assert.equal(checkContent("").ok, true);
  assert.equal(checkContent("   ").ok, true);
});
