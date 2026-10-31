"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEventRow } from "@/lib/teamData";
import { resolveTeamTheme } from "@/lib/theme/teamTheme";
import { shouldShowFundraisingNav } from "@/lib/permissions";
import { DemoTeamHeader, DemoTeamNav } from "./DemoChrome";
import DemoHome from "./DemoHome";
import DemoComms, { type CommsSection } from "./DemoComms";
import { DemoCalendarTab } from "./DemoCalendar";
import DemoTeam, { DemoMemberAthleteProfile } from "./DemoTeam";
import DemoAttendance from "./DemoAttendance";
import NextPhaseScreen from "./NextPhase";
import { DemoNavProvider } from "./demoRouter";
import { buildDemoEngagement, buildDemoFiles, buildDemoThreads, personForActor, unreadMessageCount, type DemoStore } from "./commsData";
import { buildDemoAttendanceDb, createDemoAttendanceApi, type DemoAttendanceDb } from "./attendanceData";
import { DEMO_ACTORS, DEMO_TEAM, buildDemoAnnouncements, buildDemoEvents, demoTodayISO, upcomingFrom } from "./demoData";
import type { AttendanceApi } from "@/app/team/[slug]/attendance/attendanceApi";
import { DEMO_MESSAGE_SOURCE, DEMO_ROLES, PREVIEW_ONLY, demoRouteForHref, type DemoMessage, type DemoRole, type DemoRoute } from "./demoProtocol";

// The isolated, high-fidelity ELF Team App demo shown inside the phone
// frame on /product (via /preview/team-app). Everything lives in this
// component's React state in the visitor's browser: fictional Sunridge
// Valley Comets data, no fetch, no storage, no auth, no messages, no
// notifications, no payments. The page also installs networkGuard.ts.
//
// Navigation: every anchor in the demo (the app's real components render
// plain anchors to /team/<slug>/… paths), and every router push from the
// generated twins (demoRouter.tsx), goes through navigate(): the path is
// mapped to an in-demo screen (demoRouteForHref) or answered with a
// "preview only" notice — nothing ever navigates to the real app.
//
// The embedding page (TeamAppSimulator) switches roles and resets the demo
// with window.postMessage; the demo reports the active tab back so the
// marketing page can show the matching hint. Messages are same-origin only.

/** Everything a visitor can change, shared by every role until Reset. */
type AppStore = DemoStore & { events: CalendarEventRow[]; attendance: DemoAttendanceDb };

function buildStore(now: Date): AppStore {
  const announcements = buildDemoAnnouncements(now);
  return {
    announcements, engagement: buildDemoEngagement(announcements, now), threads: buildDemoThreads(now), files: buildDemoFiles(now), seq: 0,
    events: buildDemoEvents(now), attendance: buildDemoAttendanceDb(now),
  };
}

const SCREEN_TITLES: Record<string, string> = {
  fundraiser: "Fundraiser",
  shop: "Shop",
  sponsors: "Partners",
};

const HOME: DemoRoute = { tab: "home", screen: "main", search: "", athleteId: null, commsSection: "updates" };

export default function TeamAppDemo({ initialRole, embedded }: { initialRole: DemoRole; embedded: boolean }) {
  const [role, setRole] = useState<DemoRole>(initialRole);
  const [route, setRoute] = useState<DemoRoute>(HOME);
  const [routeKey, setRouteKey] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const [store, setStoreState] = useState<AppStore | null>(null);
  const [commsSection, setCommsSection] = useState<CommsSection>("updates");
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [attendanceApi, setAttendanceApi] = useState<AttendanceApi | null>(null);

  // Dates are the team's "today" — set after mount so the server render
  // never disagrees with the browser's clock.
  /* eslint-disable react-hooks/set-state-in-effect -- builds the demo's data once per Reset, after mount */
  useEffect(() => {
    const d = new Date();
    const fresh = buildStore(d);
    setNow(d);
    setStoreState(fresh);
    // The attendance "server" for this run of the demo: owns its data and
    // mirrors every save into the store.
    setAttendanceApi(createDemoAttendanceApi(fresh.attendance, db => setStoreState(s => (s ? { ...s, attendance: db } : s))));
  }, [resetKey]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const setCommsStore = useCallback((fn: (s: DemoStore) => DemoStore) => setStoreState(s => (s ? { ...s, ...fn(s) } : s)), []);
  const setEvents = useCallback((fn: (e: CalendarEventRow[]) => CalendarEventRow[]) => setStoreState(s => (s ? { ...s, events: fn(s.events) } : s)), []);

  const notify = useCallback((msg?: string) => {
    setToast(msg ?? PREVIEW_ONLY);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const goToRoute = useCallback((next: DemoRoute) => {
    setRoute(next);
    setRouteKey(k => k + 1);
    setCommsSection(next.commsSection);
    setOpenThreadId(null);
    window.scrollTo(0, 0);
  }, []);
  const navigate = useCallback((href: string) => {
    const next = href === "back" ? demoRouteForHref("/team/demo/team?tab=roster") : demoRouteForHref(href);
    if (next) goToRoute(next);
    else notify("Preview only — this opens another part of the real app.");
  }, [goToRoute, notify]);
  const openThread = useCallback((threadId: string | null) => {
    setOpenThreadId(threadId);
    window.scrollTo(0, 0);
  }, []);

  // Intercept every link and form in the demo (including modal portals).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute("href") ?? "";
      navigate(href);
    };
    const onSubmit = (e: SubmitEvent) => { e.preventDefault(); notify(); };
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [navigate, notify]);

  // Role switching / reset from the embedding marketing page.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const msg = e.data as Partial<DemoMessage> | null;
      if (!msg || msg.source !== DEMO_MESSAGE_SOURCE) return;
      if (msg.type === "role" && msg.role && DEMO_ROLES.includes(msg.role)) {
        setRole(msg.role);
        goToRoute(HOME);
        setToast("");
      } else if (msg.type === "reset") {
        setRole("coach");
        goToRoute(HOME);
        setToast("");
        setResetKey(k => k + 1);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [goToRoute]);

  const tab = route.tab;
  useEffect(() => {
    if (!embedded || window.parent === window) return;
    const msg: DemoMessage = { source: DEMO_MESSAGE_SOURCE, type: "tab", role, tab };
    window.parent.postMessage(msg, window.location.origin);
  }, [embedded, role, tab]);

  const actor = DEMO_ACTORS[role];
  const me = personForActor(actor);
  const upcoming = useMemo(() => (now && store ? upcomingFrom(store.events, demoTodayISO(now)) : []), [now, store]);
  const themeVars = resolveTeamTheme(DEMO_TEAM.primaryColor, DEMO_TEAM.secondaryColor, DEMO_TEAM.brandingCustomized);

  // The real app's bottom nav highlights by path: nothing on a conversation
  // (/messages/<id>), the attendance screen (/attendance) or a member's
  // athlete profile (/athlete/<id>).
  const activeNav = openThreadId || route.screen === "attendance" || route.screen === "athlete" ? "" : tab;
  const screenKey = `${resetKey}-${role}-${routeKey}`;

  const screen = !now || !store ? null
    : route.screen === "attendance" ? (
      actor.kind === "coach" && attendanceApi
        ? <DemoAttendance key={screenKey} api={attendanceApi} onLeave={navigate} onSaved={() => notify("Preview only — attendance was saved in this demo only.")} />
        : <NextPhaseScreen title="Attendance" />
    )
    : route.screen === "athlete" && route.athleteId ? (
      <DemoMemberAthleteProfile key={screenKey} actor={actor} athleteId={route.athleteId} attendanceDb={store.attendance} />
    )
    : route.screen === "coach-athlete" ? <NextPhaseScreen key={screenKey} title="Athlete profile" />
    : tab === "home" ? (
      <DemoHome key={screenKey} role={role} actor={actor} announcements={store.announcements} upcoming={upcoming} onPreviewOnly={notify} />
    ) : tab === "communications" ? (
      <DemoComms
        key={`${resetKey}-${role}`}
        role={role} actor={actor} me={me} store={store} setStore={setCommsStore}
        section={commsSection} setSection={setCommsSection}
        openThreadId={openThreadId} setOpenThreadId={openThread}
        notify={notify}
      />
    ) : tab === "calendar" ? (
      <DemoCalendarTab key={`${resetKey}-${role}`} actor={actor} events={store.events} setEvents={setEvents} notify={notify} />
    ) : tab === "team" ? (
      <DemoTeam key={screenKey} actor={actor} notify={notify} />
    ) : (
      <NextPhaseScreen title={SCREEN_TITLES[tab] ?? "This screen"} />
    );

  return (
    <DemoNavProvider value={{ navigate, notify, search: route.search }}>
      <div className="elf-shell" style={{
        minHeight: "100vh",
        background: "var(--shell-backdrop)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        ...(themeVars as React.CSSProperties),
      }}>
        {/* Twin of TeamShell.module.css's mobile .shellPanel / .mainContent. */}
        <div style={{ width: "100%", maxWidth: 430, minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f5f6f8", boxShadow: "0 0 60px rgba(0, 0, 0, .45)" }}>
          <DemoTeamNav
            active={activeNav}
            showSponsors
            showFundraiser={shouldShowFundraisingNav(true, actor)}
            badgeCounts={{ communications: store ? unreadMessageCount(store, me.key) : 0 }}
          />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ position: "sticky", top: 0, zIndex: 40 }}>
              <DemoTeamHeader
                key={role}
                accountName={actor.kind === "public" ? "" : actor.session.name}
                isMember={actor.kind === "member"}
                onAccount={() => notify("Preview only — the account menu isn't part of this demo.")}
              />
            </div>
            <main style={{ flex: 1, minWidth: 0, padding: "1rem 0.875rem 5.5rem" }}>
              {screen}
            </main>
          </div>
        </div>

        <div role="status" aria-live="polite" style={{ position: "fixed", left: 12, right: 12, bottom: 78, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 60 }}>
          {toast && (
            <span style={{ background: "#12151C", color: "#fff", fontSize: ".78rem", lineHeight: 1.4, padding: ".6rem .85rem", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,.25)", textAlign: "center", maxWidth: 360 }}>
              {toast}
            </span>
          )}
        </div>
      </div>
    </DemoNavProvider>
  );
}
