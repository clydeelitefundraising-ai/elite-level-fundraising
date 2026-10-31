"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { RotateCcw } from "lucide-react";
import { SAMPLE_NOTICE } from "./fixtures";
import {
  DEMO_MESSAGE_SOURCE, DEMO_PAGE_PATH, DEMO_ROLES,
  type DemoMessage, type DemoRole,
} from "@/components/marketing/team-app-demo/demoProtocol";

// Interactive ELF Team App demo for /product. The phone frame shows the
// isolated demo page (/preview/team-app): the real Team App's presentation
// components with fictional Sunridge Valley Comets data, held only in the
// visitor's browser — no sign-in, no API requests, no messages, no
// notifications and no payments (see team-app-demo/TeamAppDemo.tsx and
// networkGuard.ts). This component only owns the controls beside the
// phone: it switches roles and resets the demo with a same-origin
// postMessage, and shows a hint for whichever tab the demo reports.

export type Role = DemoRole;

const ROLES: { id: Role; label: string; blurb: string }[] = [
  { id: "coach", label: "Coach", blurb: "Post team updates, plan the calendar, take attendance and follow the fundraiser." },
  { id: "athlete", label: "Athlete", blurb: "See what's next, read team updates, message coaches and share a personal fundraising page." },
  { id: "parent", label: "Parent", blurb: "Follow your athlete's team: updates, the calendar, messages with coaches and the fundraiser." },
];

/** Hints for the real app's tabs built so far. */
export const TAB_HINTS: Record<Role, Record<string, string>> = {
  coach: {
    home: "Quick actions, requests, what's next and the latest team update. Tap an event for details.",
    communications: "Post an update, then try Messages: start a conversation or a group. Families are included automatically, and assistant coaches' chats appear under Oversight.",
    calendar: "Switch Month and Agenda, tap a day or an event, or add one. Export shows the calendar sync options.",
    fundraiser: "Track the campaign, pace, athletes and donors, then open Follow-Ups to log outreach for an athlete.",
    shop: "The team's Gear Gallery. Add or edit a product — orders happen in the team's own store, never here.",
    team: "Open Roster, then Take Attendance, or tap an athlete. To-Do List shows each task's completion.",
    sponsors: "ELF Community Partners and the team's own sponsors. Coaches can add, edit and reorder sponsors.",
  },
  athlete: {
    home: "The team's fundraiser, what's next and the latest from your coach. Tap an event for details.",
    communications: "Like and comment on updates, then message a coach. Your parent is included automatically.",
    calendar: "Practices, film, games and team events. Tap a day or an event for details.",
    fundraiser: "Your progress, your share link and QR code, your contacts and the team leaderboard.",
    shop: "Team gear from the official team store. Nothing can be bought in this demo.",
    team: "Open the To-Do List to acknowledge a task, or Roster to see your profile and attendance.",
    sponsors: "The local businesses supporting ELF and your team.",
  },
  parent: {
    home: "Your athlete's team at a glance: the fundraiser, what's next and the latest update.",
    communications: "Updates for families, comments, and messages with your athlete's coaches — your athlete is included automatically.",
    calendar: "Every practice, game and team event. Export shows how to sync it to your phone.",
    fundraiser: "Jordan's fundraising: progress, the share link, contacts and the team leaderboard.",
    shop: "Team gear from the official team store. Nothing can be bought in this demo.",
    team: "Open the To-Do List to acknowledge tasks for Jordan, or Roster to see Jordan's profile.",
    sponsors: "The local businesses supporting ELF and your athlete's team.",
  },
};

const TAB_NAMES: Record<string, string> = {
  home: "Home", communications: "Comms", calendar: "Calendar", fundraiser: "Fundraiser", shop: "Shop", team: "Team", sponsors: "Partners",
};

/** Arrow-key navigation for a set of tab buttons (WAI-ARIA tabs pattern). */
function onTabKey(e: KeyboardEvent<HTMLElement>, ids: string[], current: string, select: (id: string) => void) {
  const i = ids.indexOf(current);
  let next = -1;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % ids.length;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + ids.length) % ids.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = ids.length - 1;
  if (next < 0) return;
  e.preventDefault();
  select(ids[next]);
  const list = e.currentTarget.closest("[role=tablist]");
  (list?.querySelectorAll<HTMLElement>("[role=tab]")[next])?.focus();
}

export function TeamAppSimulator() {
  const [role, setRole] = useState<Role>("coach");
  const [tab, setTab] = useState("home");
  const [src, setSrc] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  // Deep link from the homepage role cards: /product?role=athlete#simulator.
  // The frame's first URL carries the starting role; later switches are
  // postMessages, so the demo doesn't reload.
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("role");
    const start: Role = DEMO_ROLES.includes(r as Role) ? (r as Role) : "coach";
    // Syncing from the URL once after mount (the static page can't know it).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(start);
    setSrc(`${DEMO_PAGE_PATH}?role=${start}&embed=1`);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const msg = e.data as Partial<DemoMessage> | null;
      if (msg?.source === DEMO_MESSAGE_SOURCE && msg.type === "tab" && typeof msg.tab === "string") setTab(msg.tab);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const post = (msg: DemoMessage) => frame.current?.contentWindow?.postMessage(msg, window.location.origin);
  const selectRole = (r: string) => {
    setRole(r as Role);
    setTab("home");
    post({ source: DEMO_MESSAGE_SOURCE, type: "role", role: r as Role });
  };
  const reset = () => {
    setRole("coach");
    setTab("home");
    post({ source: DEMO_MESSAGE_SOURCE, type: "reset" });
  };

  const hint = TAB_HINTS[role][tab] ?? "This screen is coming in the next phase of the demo.";

  return (
    <div className="mk-sim">
      <div className="mk-sim-controls">
        <div className="mk-sim-roles" role="tablist" aria-label="Choose a view">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              id={`mk-sim-role-${r.id}`}
              aria-selected={role === r.id}
              aria-controls="mk-sim-phone"
              tabIndex={role === r.id ? 0 : -1}
              onClick={() => selectRole(r.id)}
              onKeyDown={(e) => onTabKey(e, ROLES.map((x) => x.id), role, selectRole)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="mk-sim-blurb">{ROLES.find((r) => r.id === role)!.blurb}</p>
        <div className="mk-sim-try">
          <strong>{TAB_NAMES[tab] ?? "Home"}:</strong> {hint}
        </div>
        <button type="button" className="mk-sim-reset" onClick={reset}>
          <RotateCcw size={15} aria-hidden="true" /> Reset demo
        </button>
        <p className="mk-sim-fine">{SAMPLE_NOTICE} Nothing you do here is sent or saved.</p>
      </div>

      <div className="mk-sim-device">
        <div className="mk-sim-phone" id="mk-sim-phone" role="tabpanel" aria-labelledby={`mk-sim-role-${role}`}>
          <div className="mk-sim-status" aria-hidden="true"><span>9:41</span><span className="mk-sim-notch" /><span /></div>
          {src && (
            <iframe
              ref={frame}
              src={src}
              title="Interactive ELF Team App demo — fictional Sunridge Valley Comets team; nothing is sent or saved"
              loading="lazy"
              className="mk-sim-frame"
              onLoad={() => post({ source: DEMO_MESSAGE_SOURCE, type: "role", role })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
