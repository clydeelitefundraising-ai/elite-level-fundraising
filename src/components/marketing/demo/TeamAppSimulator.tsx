"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Home, ClipboardCheck, MessageCircle, DollarSign, User, Calendar, Trophy, Heart,
  ChevronLeft, ChevronRight, Megaphone, Send, Share2, RotateCcw, CalendarPlus, Lock,
} from "lucide-react";
import {
  SAMPLE_ANNOUNCEMENTS, SAMPLE_ATHLETES, SAMPLE_CAMPAIGN, SAMPLE_DONATIONS, SAMPLE_EVENTS, SAMPLE_ME,
  SAMPLE_NOTICE, SAMPLE_PARENT_NAME, SAMPLE_ROSTER, SAMPLE_TEAM, SAMPLE_THREADS_COACH, SAMPLE_THREADS_PARENT,
  sampleRank, usd, type SampleAnnouncement, type SampleEvent, type SampleThread,
} from "./fixtures";

// Interactive ELF Team App simulator for /product. Everything here lives in
// this component's React state, in the visitor's browser: fictional data
// from ./fixtures, no fetch, no storage, no auth, no messages, no
// notifications, no attendance records and no payments. Anything that would
// save or send in the real app shows a "Preview only" notice instead.
// demoIsolation.test.ts enforces that this file never imports or calls
// anything that could reach a server.
//
// Screens mirror features that exist in the production app: announcements
// (with comments), direct messages that automatically include the
// athlete's parent/guardian under head-coach oversight, present/absent
// attendance with an absence reason, the team calendar (with calendar
// subscription), athlete fundraising pages, share links and the leaderboard.

export type Role = "coach" | "athlete" | "parent";

const ROLES: { id: Role; label: string; blurb: string }[] = [
  { id: "coach", label: "Coach", blurb: "Run the team: announcements, attendance, messages and the fundraiser." },
  { id: "athlete", label: "Athlete", blurb: "The schedule, team updates, a personal fundraising page and the leaderboard." },
  { id: "parent", label: "Parent", blurb: "Stay in the loop, follow the calendar and support your athlete." },
];

type TabDef = { id: string; label: string; icon: typeof Home; hint: string };

export const ROLE_TABS: Record<Role, TabDef[]> = {
  coach: [
    { id: "home", label: "Home", icon: Home, hint: "Open an announcement, or jump to today's attendance." },
    { id: "attendance", label: "Attendance", icon: ClipboardCheck, hint: "Mark athletes present or absent, with a reason." },
    { id: "messages", label: "Messages", icon: MessageCircle, hint: "Open a conversation — the athlete's parent is included automatically." },
    { id: "fundraiser", label: "Fundraiser", icon: DollarSign, hint: "See team progress and each athlete's progress to goal." },
  ],
  athlete: [
    { id: "home", label: "Home", icon: Home, hint: "What's next and the latest from your coach." },
    { id: "mypage", label: "My Page", icon: User, hint: "Your personal fundraising page and share link." },
    { id: "schedule", label: "Schedule", icon: Calendar, hint: "Practices, games and meetings. Tap one for details." },
    { id: "leaderboard", label: "Leaderboard", icon: Trophy, hint: "See where you rank. Filter by class year." },
  ],
  parent: [
    { id: "home", label: "Home", icon: Home, hint: "Everything about your athlete's team in one place." },
    { id: "schedule", label: "Schedule", icon: Calendar, hint: "The team calendar. Subscribe so it shows up on your phone." },
    { id: "messages", label: "Messages", icon: MessageCircle, hint: "Talk with the coach — your athlete is included." },
    { id: "support", label: "Support", icon: Heart, hint: "Follow your athlete's fundraiser and share their page." },
  ],
};

export const PREVIEW_ONLY = "Preview only — nothing is sent or saved.";

type Mark = { status: "present" | "absent"; reason: "excused" | "unexcused" | "other" | null };

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
  const [resetKey, setResetKey] = useState(0);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deep link from the homepage role cards: /product?role=athlete#simulator.
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("role");
    // Syncing from the URL once after mount (the static page can't know it).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (r === "coach" || r === "athlete" || r === "parent") setRole(r);
  }, []);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const selectRole = (r: string) => { setRole(r as Role); setTab("home"); };
  const tabs = ROLE_TABS[role];
  const activeTab = tabs.find((t) => t.id === tab) ?? tabs[0];
  const reset = () => { setRole("coach"); setTab("home"); setToast(""); setResetKey((k) => k + 1); };

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
          <strong>{activeTab.label}:</strong> {activeTab.hint}
        </div>
        <button type="button" className="mk-sim-reset" onClick={reset}>
          <RotateCcw size={15} aria-hidden="true" /> Reset demo
        </button>
        <p className="mk-sim-fine">{SAMPLE_NOTICE} Nothing you do here is sent or saved.</p>
      </div>

      <div className="mk-sim-device">
        <div className="mk-sim-phone" id="mk-sim-phone" role="tabpanel" aria-labelledby={`mk-sim-role-${role}`}>
          <div className="mk-sim-status" aria-hidden="true"><span>9:41</span><span className="mk-sim-notch" /><span>ELF</span></div>
          <header className="mk-sim-header">
            <span className="mk-sim-logo" aria-hidden="true">SV</span>
            <span>
              <strong>{SAMPLE_TEAM.shortName} {SAMPLE_TEAM.mascot}</strong>
              <small>{SAMPLE_TEAM.sportName} · {role === "coach" ? "Head Coach" : role === "athlete" ? "Athlete" : `Parent of ${SAMPLE_ME.name.split(" ")[0]}`}</small>
            </span>
          </header>

          <div className="mk-sim-screen" role="tabpanel" id="mk-sim-screen" aria-label={`${activeTab.label} screen`} key={`${resetKey}-${role}-${activeTab.id}`}>
            <Screen role={role} tab={activeTab.id} notify={notify} goTo={setTab} />
          </div>

          <div className="mk-sim-toast" role="status" aria-live="polite">{toast && <span>{toast}</span>}</div>

          <nav className="mk-sim-tabs" role="tablist" aria-label="App sections">
            {tabs.map((t) => {
              const Icon = t.icon;
              const selected = t.id === activeTab.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="mk-sim-screen"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  onKeyDown={(e) => onTabKey(e, tabs.map((x) => x.id), activeTab.id, setTab)}
                >
                  <Icon size={19} aria-hidden="true" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}

// ── Screens ─────────────────────────────────────────────────────────────────

type ScreenProps = { role: Role; tab: string; notify: (m: string) => void; goTo: (tab: string) => void };

function Screen({ role, tab, notify, goTo }: ScreenProps) {
  if (role === "coach") {
    if (tab === "attendance") return <CoachAttendance notify={notify} />;
    if (tab === "messages") return <Messages threads={SAMPLE_THREADS_COACH} me="Coach Whitfield" notify={notify} showAnnouncements />;
    if (tab === "fundraiser") return <CoachFundraiser notify={notify} />;
    return <HomeScreen role="coach" goTo={goTo} notify={notify} />;
  }
  if (role === "athlete") {
    if (tab === "mypage") return <MyFundraisingPage notify={notify} who="athlete" />;
    if (tab === "schedule") return <Schedule notify={notify} />;
    if (tab === "leaderboard") return <Leaderboard />;
    return <HomeScreen role="athlete" goTo={goTo} notify={notify} />;
  }
  if (tab === "schedule") return <Schedule notify={notify} />;
  if (tab === "messages") return <Messages threads={SAMPLE_THREADS_PARENT} me={SAMPLE_PARENT_NAME} notify={notify} />;
  if (tab === "support") return <MyFundraisingPage notify={notify} who="parent" />;
  return <HomeScreen role="parent" goTo={goTo} notify={notify} />;
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mk-sim-card">
      <div className="mk-sim-card-head"><h4>{title}</h4>{action}</div>
      {children}
    </section>
  );
}

function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="mk-sim-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

function AnnouncementList({ items }: { items: SampleAnnouncement[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const current = items.find((a) => a.id === open);
  if (current) {
    return (
      <div className="mk-sim-detail">
        <button type="button" className="mk-sim-back" onClick={() => setOpen(null)}><ChevronLeft size={16} aria-hidden="true" /> All announcements</button>
        <h4>{current.title}</h4>
        <p className="mk-sim-meta">{current.author} · {current.role} · {current.time}</p>
        <p>{current.body}</p>
        <p className="mk-sim-meta">{current.comments} comments</p>
      </div>
    );
  }
  return (
    <ul className="mk-sim-list">
      {items.map((a) => (
        <li key={a.id}>
          <button type="button" className="mk-sim-row" onClick={() => setOpen(a.id)}>
            <Megaphone size={16} aria-hidden="true" />
            <span><strong>{a.title}</strong><small>{a.author} · {a.time}</small></span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function NextUp({ event }: { event: SampleEvent }) {
  return (
    <div className="mk-sim-next">
      <span className="mk-sim-date"><small>{event.day}</small>{event.date.split(" ")[1]}</span>
      <span><strong>{event.title}</strong><small>{event.time} · {event.place}</small></span>
    </div>
  );
}

function HomeScreen({ role, goTo }: { role: Role; goTo: (t: string) => void; notify: (m: string) => void }) {
  const me = SAMPLE_ATHLETES.find((a) => a.id === SAMPLE_ME.id)!;
  return (
    <div className="mk-sim-stack">
      <p className="mk-sim-hello">
        {role === "coach" ? "Good afternoon, Coach Whitfield" : role === "athlete" ? `Hey ${me.name.split(" ")[0]}` : `Hi ${SAMPLE_PARENT_NAME.split(" ")[0]} — following ${me.name.split(" ")[0]}`}
      </p>
      <Card title="Next up"><NextUp event={SAMPLE_EVENTS[0]} /></Card>
      {role === "coach" && (
        <Card title="Today's attendance" action={<button type="button" className="mk-sim-link" onClick={() => goTo("attendance")}>Take attendance</button>}>
          <p className="mk-sim-meta">Thursday practice · {SAMPLE_ROSTER.length} athletes on the roster</p>
        </Card>
      )}
      {role !== "coach" && (
        <Card title={role === "athlete" ? "My fundraising" : `${me.name.split(" ")[0]}'s fundraising`} action={<button type="button" className="mk-sim-link" onClick={() => goTo(role === "athlete" ? "mypage" : "support")}>Open</button>}>
          <p className="mk-sim-big">{usd(me.raised)} <small>of {usd(me.goal)}</small></p>
          <Progress value={me.raised} max={me.goal} label="Progress to personal goal" />
        </Card>
      )}
      {role === "coach" && (
        <Card title="Fundraiser" action={<button type="button" className="mk-sim-link" onClick={() => goTo("fundraiser")}>Details</button>}>
          <p className="mk-sim-big">{usd(SAMPLE_CAMPAIGN.raised)} <small>of {usd(SAMPLE_CAMPAIGN.goal)}</small></p>
          <Progress value={SAMPLE_CAMPAIGN.raised} max={SAMPLE_CAMPAIGN.goal} label="Team progress to goal" />
        </Card>
      )}
      <Card title="Announcements"><AnnouncementList items={SAMPLE_ANNOUNCEMENTS} /></Card>
    </div>
  );
}

function CoachAttendance({ notify }: { notify: (m: string) => void }) {
  const [marks, setMarks] = useState<Record<string, Mark>>(() =>
    Object.fromEntries(SAMPLE_ROSTER.map((a) => [a.id, { status: "present", reason: null }])),
  );
  const absent = Object.values(marks).filter((m) => m.status === "absent").length;
  const set = (id: string, m: Mark) => setMarks((prev) => ({ ...prev, [id]: m }));
  return (
    <div className="mk-sim-stack">
      <Card title="Thursday practice · Nov 5">
        <p className="mk-sim-meta">{SAMPLE_ROSTER.length - absent} present · {absent} absent</p>
      </Card>
      <ul className="mk-sim-list mk-sim-attendance">
        {SAMPLE_ROSTER.map((a) => {
          const m = marks[a.id];
          return (
            <li key={a.id}>
              <div className="mk-sim-att-row">
                <span><strong>{a.name}</strong><small>{a.position}</small></span>
                <span className="mk-sim-pill-group" role="group" aria-label={`${a.name} attendance`}>
                  <button type="button" aria-pressed={m.status === "present"} onClick={() => set(a.id, { status: "present", reason: null })}>Present</button>
                  <button type="button" aria-pressed={m.status === "absent"} onClick={() => set(a.id, { status: "absent", reason: m.reason })}>Absent</button>
                </span>
              </div>
              {m.status === "absent" && (
                <span className="mk-sim-reasons" role="group" aria-label={`${a.name} absence reason`}>
                  {(["excused", "unexcused", "other"] as const).map((r) => (
                    <button key={r} type="button" aria-pressed={m.reason === r} onClick={() => set(a.id, { status: "absent", reason: r })}>
                      {r[0].toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className="mk-sim-primary" onClick={() => notify(`${PREVIEW_ONLY} In the real app, attendance is saved for the team.`)}>
        Submit attendance
      </button>
    </div>
  );
}

function Messages({ threads, me, notify, showAnnouncements }: { threads: SampleThread[]; me: string; notify: (m: string) => void; showAnnouncements?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [extra, setExtra] = useState<Record<string, { body: string; time: string }[]>>({});
  const [draft, setDraft] = useState("");
  const thread = threads.find((t) => t.id === openId);

  if (thread) {
    const send = () => {
      const body = draft.trim();
      if (!body) return;
      setExtra((prev) => ({ ...prev, [thread.id]: [...(prev[thread.id] ?? []), { body, time: "Now" }] }));
      setDraft("");
      notify(PREVIEW_ONLY);
    };
    return (
      <div className="mk-sim-thread">
        <button type="button" className="mk-sim-back" onClick={() => setOpenId(null)}><ChevronLeft size={16} aria-hidden="true" /> Messages</button>
        <h4>{thread.with}</h4>
        {thread.note && <p className="mk-sim-note"><Lock size={12} aria-hidden="true" /> {thread.note}</p>}
        <ol className="mk-sim-bubbles" aria-label="Conversation">
          {thread.messages.map((m, i) => (
            <li key={i} className={m.mine ? "mine" : ""}><span>{m.body}</span><small>{m.mine ? "You" : m.from} · {m.time}</small></li>
          ))}
          {(extra[thread.id] ?? []).map((m, i) => (
            <li key={`x${i}`} className="mine"><span>{m.body}</span><small>You · {m.time} · preview, not sent</small></li>
          ))}
        </ol>
        <form className="mk-sim-compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label htmlFor="mk-sim-draft" className="mk-sim-sr">Message {thread.with}</label>
          <input id="mk-sim-draft" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Message as ${me}…`} autoComplete="off" />
          <button type="submit" aria-label="Send (preview only)"><Send size={16} aria-hidden="true" /></button>
        </form>
      </div>
    );
  }

  return (
    <div className="mk-sim-stack">
      {showAnnouncements && <Card title="Announcements"><AnnouncementList items={SAMPLE_ANNOUNCEMENTS.slice(0, 2)} /></Card>}
      <Card title="Direct messages">
        <ul className="mk-sim-list">
          {threads.map((t) => (
            <li key={t.id}>
              <button type="button" className="mk-sim-row" onClick={() => setOpenId(t.id)}>
                <MessageCircle size={16} aria-hidden="true" />
                <span><strong>{t.with}{t.unread && <em className="mk-sim-dot" aria-label="unread" />}</strong><small>{t.preview}</small></span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function CoachFundraiser({ notify }: { notify: (m: string) => void }) {
  const ranked = [...SAMPLE_ATHLETES].sort((a, b) => b.raised - a.raised);
  return (
    <div className="mk-sim-stack">
      <Card title="Team fundraiser">
        <p className="mk-sim-big">{usd(SAMPLE_CAMPAIGN.raised)} <small>of {usd(SAMPLE_CAMPAIGN.goal)}</small></p>
        <Progress value={SAMPLE_CAMPAIGN.raised} max={SAMPLE_CAMPAIGN.goal} label="Team progress to goal" />
        <p className="mk-sim-meta">{SAMPLE_CAMPAIGN.donors} donations · {SAMPLE_CAMPAIGN.daysLeft} days left</p>
        <button type="button" className="mk-sim-secondary" onClick={() => notify(`${PREVIEW_ONLY} Coaches share the team's campaign link from here.`)}>
          <Share2 size={15} aria-hidden="true" /> Share campaign link
        </button>
      </Card>
      <Card title="Athletes">
        <ul className="mk-sim-list">
          {ranked.slice(0, 6).map((a) => (
            <li key={a.id} className="mk-sim-ath">
              <span><strong>{a.name}</strong><small>{usd(a.raised)} of {usd(a.goal)}</small></span>
              <Progress value={a.raised} max={a.goal} label={`${a.name} progress to goal`} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function MyFundraisingPage({ notify, who }: { notify: (m: string) => void; who: "athlete" | "parent" }) {
  const me = SAMPLE_ATHLETES.find((a) => a.id === SAMPLE_ME.id)!;
  const first = me.name.split(" ")[0];
  const supporters = SAMPLE_DONATIONS.filter((d) => d.message.includes(first) || d.name.includes("Ellis"));
  return (
    <div className="mk-sim-stack">
      <Card title={who === "athlete" ? "My fundraising page" : `${first}'s fundraising page`}>
        <p className="mk-sim-big">{usd(me.raised)} <small>of {usd(me.goal)}</small></p>
        <Progress value={me.raised} max={me.goal} label="Progress to personal goal" />
        <p className="mk-sim-meta">#{sampleRank(me.id)} on the team leaderboard</p>
        <div className="mk-sim-actions">
          <button type="button" className="mk-sim-primary" onClick={() => notify(`${PREVIEW_ONLY} In the real app this copies ${first}'s personal share link.`)}>
            <Share2 size={15} aria-hidden="true" /> Share {who === "athlete" ? "my" : `${first}'s`} link
          </button>
          {who === "parent" && (
            <button type="button" className="mk-sim-secondary" onClick={() => notify(`${PREVIEW_ONLY} Donations open ${first}'s secure Stripe checkout in the real app.`)}>
              <Heart size={15} aria-hidden="true" /> Donate
            </button>
          )}
        </div>
      </Card>
      <Card title="Recent supporters">
        <ul className="mk-sim-list">
          {(supporters.length ? supporters : SAMPLE_DONATIONS.slice(0, 2)).map((d) => (
            <li key={d.name} className="mk-sim-supporter">
              <strong>{d.name}</strong> <span>{usd(d.amount)}</span>
              {d.message && <small>&ldquo;{d.message}&rdquo;</small>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Schedule({ notify }: { notify: (m: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mk-sim-stack">
      <button type="button" className="mk-sim-secondary" onClick={() => notify(`${PREVIEW_ONLY} In the real app you can subscribe to the team calendar on your phone.`)}>
        <CalendarPlus size={15} aria-hidden="true" /> Subscribe to team calendar
      </button>
      <ul className="mk-sim-list mk-sim-events">
        {SAMPLE_EVENTS.map((ev) => (
          <li key={ev.id}>
            <button type="button" className="mk-sim-row" aria-expanded={open === ev.id} onClick={() => setOpen(open === ev.id ? null : ev.id)}>
              <span className="mk-sim-date"><small>{ev.day}</small>{ev.date.split(" ")[1]}</span>
              <span><strong>{ev.title}</strong><small>{ev.kind} · {ev.time}</small></span>
              <ChevronRight size={16} aria-hidden="true" className={open === ev.id ? "mk-sim-rot" : ""} />
            </button>
            {open === ev.id && <p className="mk-sim-event-detail">{ev.date} · {ev.time}<br />{ev.place}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Leaderboard() {
  const classes = ["All", ...Array.from(new Set(SAMPLE_ATHLETES.map((a) => a.class_year)))];
  const [filter, setFilter] = useState("All");
  const ranked = [...SAMPLE_ATHLETES].sort((a, b) => b.raised - a.raised).filter((a) => filter === "All" || a.class_year === filter);
  return (
    <div className="mk-sim-stack">
      <div className="mk-sim-chips" role="group" aria-label="Filter by class year">
        {classes.map((c) => <button key={c} type="button" aria-pressed={filter === c} onClick={() => setFilter(c)}>{c}</button>)}
      </div>
      <ol className="mk-sim-list mk-sim-board">
        {ranked.map((a, i) => (
          <li key={a.id} className={a.id === SAMPLE_ME.id ? "me" : ""}>
            <span className="mk-sim-rank">{i + 1}</span>
            <span><strong>{a.name}{a.id === SAMPLE_ME.id && " (you)"}</strong><small>{a.class_year} · {a.event}</small></span>
            <span className="mk-sim-amt">{usd(a.raised)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
