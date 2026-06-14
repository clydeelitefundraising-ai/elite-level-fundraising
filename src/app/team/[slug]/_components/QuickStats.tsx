import type { CalendarEventRow } from "@/lib/teamData";

function fmt(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 10000) return `$${(dollars / 1000).toFixed(0)}k`;
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(y, m - 1, d));
}

export default function QuickStats({
  raisedCents,
  goalCents,
  donorCount,
  nextEvent,
  primaryColor,
}: {
  raisedCents: number;
  goalCents: number;
  donorCount: number;
  nextEvent: CalendarEventRow | null;
  primaryColor: string;
}) {
  const pct = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;

  const stats = [
    { label: "Raised",  value: fmt(raisedCents) },
    { label: "Goal",    value: goalCents > 0 ? fmt(goalCents) : "—" },
    { label: "Next",    value: nextEvent ? fmtDate(nextEvent.event_date) : "—" },
    { label: "Donors",  value: String(donorCount) },
  ];

  return (
    <div>
      <div style={{ background: "#fff", display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {stats.map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: ".5rem .4rem",
              textAlign: "center",
              borderRight: i < 3 ? "1px solid #f0f0f0" : "none",
            }}
          >
            <div style={{ fontSize: ".52rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: ".15rem" }}>
              {s.label}
            </div>
            <div style={{ fontWeight: 800, fontSize: ".88rem", color: "#0b1e3d", lineHeight: 1 }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 3, background: "#eaecef" }}>
        {goalCents > 0 && (
          <div style={{ height: "100%", width: `${pct}%`, background: primaryColor, transition: "width .5s ease" }} />
        )}
      </div>
    </div>
  );
}
