import { calendarEvents, teamInfo } from "../_data/mockData";

type EventType = "game" | "practice" | "fundraiser" | "team";

const eventConfig: Record<EventType, {
  label: string; dot: string; bg: string;
  badgeBg: string; badgeText: string; icon: string;
}> = {
  game:       { label: "Game",       dot: "#1A3A5C", bg: "rgba(26,58,92,0.06)",    badgeBg: "rgba(26,58,92,0.1)",   badgeText: "#1A3A5C", icon: "🏟️" },
  practice:   { label: "Practice",   dot: "#6B7280", bg: "rgba(107,114,128,0.06)", badgeBg: "rgba(107,114,128,0.1)",badgeText: "#4B5563", icon: "⏱️" },
  fundraiser: { label: "Fundraiser", dot: "#C9A84C", bg: "rgba(201,168,76,0.08)",  badgeBg: "rgba(201,168,76,0.15)",badgeText: "#92700A", icon: "💰" },
  team:       { label: "Team Event", dot: "#0B1E3D", bg: "rgba(11,30,61,0.05)",    badgeBg: "rgba(11,30,61,0.08)",  badgeText: "#0B1E3D", icon: "🤝" },
};

// Group events by month for display
function groupByMonth(events: typeof calendarEvents) {
  const groups: Record<string, typeof calendarEvents> = {};
  events.forEach((e) => {
    const month = e.date.split(" ")[0];
    if (!groups[month]) groups[month] = [];
    groups[month].push(e);
  });
  return groups;
}

export default function CalendarPage() {
  const grouped = groupByMonth(calendarEvents);

  return (
    <div className="ta-page-enter">
      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Header */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Calendar
          </p>
          <p style={{ fontSize: 20, fontWeight: 800, color: "#0A0A0A", marginTop: 3 }}>
            {teamInfo.season} Schedule
          </p>
        </div>

        {/* Legend pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(Object.entries(eventConfig) as [EventType, typeof eventConfig[EventType]][]).map(([type, cfg]) => (
            <div
              key={type}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: 100,
                background: cfg.badgeBg,
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: cfg.badgeText }}>
                {cfg.label}
              </span>
            </div>
          ))}
        </div>

        {/* Events grouped by month */}
        {/* TODO (Supabase): load from events table where team_id = teamId and event_date >= now() */}
        {Object.entries(grouped).map(([month, events]) => (
          <div key={month}>
            {/* Month header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#0A0A0A", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {month}
              </p>
              <div style={{ flex: 1, height: 1, background: "#EDE9E3" }} />
              <span
                style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 100,
                  background: "#F5F0EA", color: "#9CA3AF",
                }}
              >
                {events.length} events
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {events.map((event, i) => {
                const cfg = eventConfig[event.type];
                const day = event.date.split(" ")[1].replace(",", "");

                return (
                  <div
                    key={event.id}
                    className="ta-pressable ta-stagger-child"
                    style={{
                      display: "flex", alignItems: "stretch",
                      background: "#FFFFFF", borderRadius: 18,
                      boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
                      overflow: "hidden",
                      "--i": i,
                    } as React.CSSProperties}
                  >
                    {/* Left color strip */}
                    <div style={{ width: 4, flexShrink: 0, background: cfg.dot }} />

                    {/* Date column */}
                    <div
                      style={{
                        width: 54, flexShrink: 0,
                        background: cfg.bg,
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        padding: "12px 0",
                      }}
                    >
                      <span style={{ fontSize: 9, fontWeight: 800, color: cfg.dot, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        {month.slice(0, 3)}
                      </span>
                      <span style={{ fontSize: 24, fontWeight: 900, color: "#0A0A0A", lineHeight: 1 }}>
                        {day}
                      </span>
                    </div>

                    {/* Event info */}
                    <div style={{ flex: 1, padding: "12px 14px", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#0A0A0A", lineHeight: 1.2, flex: 1, minWidth: 0 }}>
                          {event.title}
                        </p>
                        <span
                          style={{
                            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                            background: cfg.badgeBg, color: cfg.badgeText,
                            textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0,
                          }}
                        >
                          {cfg.label}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span style={{ fontSize: 11, color: "#9CA3AF" }}>{event.time}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round">
                            <path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span style={{ fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {event.location}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Event type icon */}
                    <div style={{ display: "flex", alignItems: "center", paddingRight: 14 }}>
                      <span style={{ fontSize: 20 }}>{cfg.icon}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Empty state */}
        {calendarEvents.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📅</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#0A0A0A" }}>No events scheduled</p>
            <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 6 }}>
              Add your first event to get started.
            </p>
          </div>
        )}

        {/* Add event — TODO: admin-only */}
        <button
          style={{
            width: "100%", padding: "14px", borderRadius: 18,
            border: "2px dashed #D1D5DB", background: "transparent",
            fontSize: 13, fontWeight: 600, color: "#9CA3AF", cursor: "not-allowed",
          }}
          disabled
        >
          + Add Event (Admin Only)
        </button>

      </div>
    </div>
  );
}
