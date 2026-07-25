// Shared fallback shown to a logged-in, non-coach team member (or booster)
// who hits a coach-only page. Previously defined locally (byte-for-byte
// identical) inside analytics/page.tsx only — extracted so the new
// coach-only participants page doesn't duplicate it a third time.
export default function CoachOnlyGate({ slug }: { slug: string }) {
  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: "2.5rem 1.5rem",
        textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      }}>
        <div style={{ fontSize: "2rem", marginBottom: ".65rem", opacity: .35 }}>🔒</div>
        <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0b1e3d", marginBottom: ".3rem" }}>
          Coach Access Only
        </div>
        <p style={{ margin: "0 0 1.25rem", fontSize: ".85rem", color: "#6b7280", lineHeight: 1.5 }}>
          This page is only available to coaches.
        </p>
        <a
          href={`/team/${slug}/home`}
          style={{
            display: "inline-block", padding: ".55rem 1.25rem", background: "#0b1e3d",
            color: "#fff", borderRadius: 9, fontSize: ".875rem", fontWeight: 700, textDecoration: "none",
          }}
        >
          Back to Home
        </a>
      </div>
    </div>
  );
}
