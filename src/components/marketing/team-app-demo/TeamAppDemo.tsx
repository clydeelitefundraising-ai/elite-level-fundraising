"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { resolveTeamTheme } from "@/lib/theme/teamTheme";
import { shouldShowFundraisingNav } from "@/lib/permissions";
import { DemoTeamHeader, DemoTeamNav } from "./DemoChrome";
import DemoHome from "./DemoHome";
import DemoComms, { type CommsSection } from "./DemoComms";
import { buildDemoEngagement, buildDemoFiles, buildDemoThreads, personForActor, unreadMessageCount, type DemoStore } from "./commsData";
import { DEMO_ACTORS, DEMO_TEAM, buildDemoAnnouncements, buildDemoUpcoming } from "./demoData";
import { DEMO_MESSAGE_SOURCE, DEMO_ROLES, PREVIEW_ONLY, commsSectionForHref, demoTabForHref, type DemoMessage, type DemoRole } from "./demoProtocol";

// The isolated, high-fidelity ELF Team App demo shown inside the phone
// frame on /product (via /preview/team-app). Everything lives in this
// component's React state in the visitor's browser: fictional Sunridge
// Valley Comets data, no fetch, no storage, no auth, no messages, no
// notifications, no payments. The page also installs networkGuard.ts.
//
// Navigation: every anchor in the demo (the app's real components render
// plain anchors to /team/<slug>/… paths) is intercepted at the document level and
// mapped to an in-demo tab, or answered with a "preview only" notice —
// nothing ever navigates to the real app.
//
// The embedding page (TeamAppSimulator) switches roles and resets the demo
// with window.postMessage; the demo reports the active tab back so the
// marketing page can show the matching hint. Messages are same-origin only.


function buildStore(now: Date): DemoStore {
  const announcements = buildDemoAnnouncements(now);
  return { announcements, engagement: buildDemoEngagement(announcements, now), threads: buildDemoThreads(now), files: buildDemoFiles(now), seq: 0 };
}

const SCREEN_TITLES: Record<string, string> = {
  calendar: "Team Calendar",
  fundraiser: "Fundraiser",
  shop: "Shop",
  team: "Team",
  sponsors: "Partners",
};

export default function TeamAppDemo({ initialRole, embedded }: { initialRole: DemoRole; embedded: boolean }) {
  const [role, setRole] = useState<DemoRole>(initialRole);
  const [tab, setTab] = useState("home");
  const [resetKey, setResetKey] = useState(0);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const [store, setStoreState] = useState<DemoStore | null>(null);
  const [commsSection, setCommsSection] = useState<CommsSection>("updates");
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dates are the visitor's own "today" — set after mount so the server
  // render never disagrees with the browser's clock.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const d = new Date(); setNow(d); setStoreState(buildStore(d)); }, [resetKey]);
  const setStore = useCallback((fn: (s: DemoStore) => DemoStore) => setStoreState(s => (s ? fn(s) : s)), []);

  const notify = useCallback((msg?: string) => {
    setToast(msg ?? PREVIEW_ONLY);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const goTo = useCallback((next: string, section: CommsSection = "updates") => {
    setTab(next);
    setCommsSection(section);
    setOpenThreadId(null);
    window.scrollTo(0, 0);
  }, []);
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
      const target = demoTabForHref(href);
      if (target) goTo(target, target === "communications" ? commsSectionForHref(href) : "updates");
      else notify("Preview only — this opens another part of the real app.");
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
  }, [goTo, notify]);

  // Role switching / reset from the embedding marketing page.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const msg = e.data as Partial<DemoMessage> | null;
      if (!msg || msg.source !== DEMO_MESSAGE_SOURCE) return;
      if (msg.type === "role" && msg.role && DEMO_ROLES.includes(msg.role)) {
        setRole(msg.role);
        goTo("home");
        setToast("");
      } else if (msg.type === "reset") {
        setRole("coach");
        goTo("home");
        setToast("");
        setResetKey(k => k + 1);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [goTo]);

  useEffect(() => {
    if (!embedded || window.parent === window) return;
    const msg: DemoMessage = { source: DEMO_MESSAGE_SOURCE, type: "tab", role, tab };
    window.parent.postMessage(msg, window.location.origin);
  }, [embedded, role, tab]);

  const actor = DEMO_ACTORS[role];
  const me = personForActor(actor);
  const upcoming = useMemo(() => (now ? buildDemoUpcoming(now) : []), [now]);
  const themeVars = resolveTeamTheme(DEMO_TEAM.primaryColor, DEMO_TEAM.secondaryColor, DEMO_TEAM.brandingCustomized);

  return (
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
          active={openThreadId ? "" : tab}
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
            {now && store && (tab === "home" ? (
              <DemoHome key={`${resetKey}-${role}`} role={role} actor={actor} announcements={store.announcements} upcoming={upcoming} onPreviewOnly={notify} />
            ) : tab === "communications" ? (
              <DemoComms
                key={`${resetKey}-${role}`}
                role={role} actor={actor} me={me} store={store} setStore={setStore}
                section={commsSection} setSection={setCommsSection}
                openThreadId={openThreadId} setOpenThreadId={openThread}
                notify={notify}
              />
            ) : (
              <NextPhaseScreen title={SCREEN_TITLES[tab] ?? "This screen"} />
            ))}
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
  );
}

// Phase 1 of the demo covers Home; the other tabs are built in later phases.
function NextPhaseScreen({ title }: { title: string }) {
  return (
    <div className="elf-empty-state" style={{ marginTop: "1.5rem", animation: "elf-fadeUp .22s ease both" }}>
      <LayoutGrid aria-hidden="true" size={22} strokeWidth={1.75} />
      <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-secondary-app)" }}>{title}</div>
      <div style={{ fontSize: ".8rem", color: "var(--text-muted-app)" }}>
        This screen is coming in the next phase of the demo.
      </div>
    </div>
  );
}
