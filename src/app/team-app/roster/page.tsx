import { athletes, teamInfo } from "../_data/mockData";

const positions = ["All", "Sprints", "Distance", "Jumps", "Hurdles", "Throws", "Relays", "Field Events"];

// Consistent avatar gradient per slot
const avatarGrads = [
  { bg: "linear-gradient(135deg, #0B1E3D, #1A3A5C)", text: "#C9A84C" },
  { bg: "linear-gradient(135deg, #C9A84C, #F0C040)",  text: "#0B1E3D" },
  { bg: "linear-gradient(135deg, #1A3A5C, #2A5080)",  text: "#FFFFFF" },
  { bg: "linear-gradient(135deg, #374151, #4B5563)",   text: "#FFFFFF" },
];

export default function RosterPage() {
  return (
    <div className="ta-page-enter">
      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Roster
            </p>
            <p style={{ fontSize: 20, fontWeight: 800, color: "#0A0A0A", marginTop: 3 }}>
              {teamInfo.shortName} {teamInfo.mascot}
            </p>
            <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
              {teamInfo.sport} &middot; {teamInfo.season}
            </p>
          </div>
          <div
            style={{
              padding: "6px 12px", borderRadius: 100, marginTop: 2,
              background: "#F5F0EA",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0B1E3D" }}>
              {athletes.length}
            </span>
            <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 4 }}>athletes</span>
          </div>
        </div>

        {/* Search bar placeholder */}
        {/* TODO: wire to real athlete search via Supabase full-text search */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#FFFFFF", borderRadius: 14, padding: "11px 14px",
            boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <p style={{ fontSize: 14, color: "#C4BEB6" }}>Search athletes…</p>
        </div>

        {/* Position filter pills */}
        <div className="ta-no-scrollbar" style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2 }}>
          {positions.map((pos, i) => (
            <button
              key={pos}
              style={{
                flexShrink: 0, padding: "6px 13px", borderRadius: 100,
                background: i === 0 ? "#0B1E3D" : "#FFFFFF",
                color: i === 0 ? "#FFFFFF" : "#6B7280",
                fontSize: 12, fontWeight: 600,
                border: i === 0 ? "none" : "1.5px solid #E5E7EB",
                cursor: "pointer",
              }}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Athlete list */}
        {/* TODO (Supabase): load from athletes table where team_id = teamId */}
        <div
          style={{
            background: "#FFFFFF", borderRadius: 20,
            boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
            overflow: "hidden",
          }}
        >
          {athletes.map((athlete, i) => {
            const pal = avatarGrads[i % avatarGrads.length];
            return (
              <div
                key={athlete.id}
                className="ta-pressable ta-stagger-child"
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  borderBottom: i < athletes.length - 1 ? "1px solid #F5F1EC" : "none",
                  "--i": i,
                } as React.CSSProperties}
              >
                {/* Avatar — TODO: replace with <Image src={athlete.photoUrl} /> */}
                <div
                  style={{
                    width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                    background: pal.bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 800, color: pal.text,
                  }}
                >
                  {athlete.initials}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#0A0A0A", lineHeight: 1.2 }}>
                    {athlete.name}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    <span
                      style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                        background: "#F5F0EA", color: "#0B1E3D",
                      }}
                    >
                      #{athlete.number}
                    </span>
                    <span style={{ fontSize: 12, color: "#6B7280" }}>{athlete.position}</span>
                    <span style={{ fontSize: 11, color: "#C4BEB6" }}>
                      &apos;{String(athlete.gradYear).slice(2)}
                    </span>
                  </div>
                </div>

                {/* Edit placeholder — TODO: admin-only, opens athlete edit sheet */}
                <button
                  style={{
                    padding: "6px 12px", borderRadius: 10,
                    background: "#F5F0EA", color: "#9CA3AF",
                    fontSize: 12, fontWeight: 600, border: "none", cursor: "not-allowed",
                  }}
                  disabled
                >
                  Edit
                </button>

                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {athletes.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>👥</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#0A0A0A" }}>No athletes yet</p>
            <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 6 }}>
              Add your first athlete to get started.
            </p>
          </div>
        )}

        {/* Add athlete — TODO: admin-only */}
        <button
          style={{
            width: "100%", padding: "14px", borderRadius: 18,
            border: "2px dashed #D1D5DB", background: "transparent",
            fontSize: 13, fontWeight: 600, color: "#9CA3AF", cursor: "not-allowed",
          }}
          disabled
        >
          + Add Athlete (Admin Only)
        </button>

      </div>
    </div>
  );
}
