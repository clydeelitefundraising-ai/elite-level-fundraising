// Phase 7: intentionally minimal empty state. Future phases add standings/
// rankings/scoreboards/team performance/season results here — none of that
// is built yet, per spec ("establish the information architecture now").
export default function OverviewView() {
  return (
    <div style={{
      background: "#fff", borderRadius: 14, padding: "2.5rem 1.5rem", textAlign: "center",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      animation: "elf-fadeUp .22s ease both",
    }}>
      <div style={{ fontSize: "1.75rem", marginBottom: ".6rem", opacity: .35 }}>🏆</div>
      <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0b1e3d", marginBottom: ".3rem" }}>
        Team Overview
      </div>
      <p style={{ margin: 0, fontSize: ".85rem", color: "#6b7280", lineHeight: 1.5 }}>
        Team standings, rankings, and updates will appear here.
      </p>
    </div>
  );
}
