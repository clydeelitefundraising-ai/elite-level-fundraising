// Communications page UI — the Updates / Messages selector is the same
// centred segmented control as the Partners page. Structural checks on the
// component (this repo has no component-rendering test framework; see
// sponsors/partnersUi.test.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const view = read("./CommunicationsView.tsx");
const partners = read("../sponsors/PartnersView.tsx");

const tablist = view.slice(view.indexOf('role="tablist"'), view.indexOf("{SEG.map("));
const tabButton = view.slice(view.indexOf('role="tab"'), view.indexOf("{unread > 0 &&"));

test("selector: a centred, full-width segmented control capped at 440px — same track as Partners", () => {
  const track = /display: "flex", width: "100%", maxWidth: 440, boxSizing: "border-box",\s+margin: "0 auto \.85rem", background: "#f3f4f6", borderRadius: 10, padding: 3, gap: 3,/;
  assert.match(tablist, track);
  assert.match(partners, track, "Partners track unchanged — the two selectors stay in step");
  assert.ok(!tablist.includes("borderBottom"), "no longer an underline strip");
});

test("selector: Updates and Messages split the width evenly, one line each", () => {
  assert.match(tabButton, /flex: "1 1 0",\s+minWidth: 0,\s+minHeight: 40,/);
  assert.match(tabButton, /fontSize: "clamp\(\.75rem, 3\.5vw, \.875rem\)"/);
  assert.match(tabButton, /justifyContent: "center"/);
  assert.match(tabButton, /whiteSpace: "nowrap"/);
  assert.match(tabButton, /<span style=\{\{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" \}\}>\{label\}<\/span>/);
  assert.ok(!tabButton.includes("borderBottom"));
});

test("selector: active tab is the white pill, with its icon in the team accent", () => {
  assert.match(tabButton, /background: active \? "#fff" : "transparent"/);
  assert.match(tabButton, /color: active \? "#111827" : "#6b7280"/);
  assert.match(tabButton, /boxShadow: active \? "0 1px 3px rgba\(0,0,0,\.1\)" : "none"/);
  assert.match(tabButton, /<Icon size=\{15\} aria-hidden="true" style=\{\{ flexShrink: 0, color: active \? "var\(--team-primary\)" : "currentColor" \}\} \/>/);
  assert.match(tabButton, /aria-selected=\{active\}/);
});

test("selector: icons and the Messages unread badge are kept", () => {
  assert.match(view, /\{ id: "updates",\s+icon: Megaphone,\s+label: "Updates" \}/);
  assert.match(view, /\{ id: "messages", icon: MessageCircle, label: "Messages" \}/);
  assert.match(view, /const unread = id === "messages" \? dmUnreadCount : 0;/);
  assert.match(view, /\{unread > 99 \? "99\+" : unread\}/);
});

test("tab selection unchanged: Updates by default, ?tab=messages deep-links to Messages", () => {
  assert.match(view, /const initialSection: Section = searchParams\.get\("tab"\) === "messages" \? "messages" : "updates";/);
  assert.match(view, /onClick=\{\(\) => setSection\(id\)\}/);
});

test("Updates and Messages panels are passed the same props as before", () => {
  assert.match(view, /\{section === "updates" && \(\s+<UpdatesWorkspaceView/);
  assert.match(view, /onUnreadChange=\{setDmUnreadCount\}/);
  assert.match(view, /canCreateGroup=\{actor\.kind === "coach" && isCoachOnlyRole\(actor\.session\.role\)\}/);
  assert.match(view, /seasonReadOnly=\{seasonReadOnly\}/);
});
