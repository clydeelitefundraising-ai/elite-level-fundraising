import Link from "next/link";
import { getSchoolsDirectory } from "@/lib/platform/schools";

export const dynamic = "force-dynamic";

const cardStyle: React.CSSProperties = {
  display: "block",
  background: "#fff",
  borderRadius: "12px",
  padding: "1rem 1.1rem",
  boxShadow: "0 1px 3px rgba(0,0,0,.08)",
  textDecoration: "none",
  color: "inherit",
};

export default async function PlatformAdminSchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const schools = await getSchoolsDirectory(q);

  return (
    <div>
      {/* 1 column by default (phone) -> 2 at tablet -> 3 at desktop, per the
          Phase 4.1 responsive spec. Explicit breakpoints rather than
          auto-fill/minmax — a fixed minmax() floor is exactly what caused
          the cramped/overflowing phone layout this pass fixes. */}
      <style>{`
        .pa-schools-grid { display: grid; gap: .75rem; grid-template-columns: 1fr; }
        @media (min-width: 640px)  { .pa-schools-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 1024px) { .pa-schools-grid { grid-template-columns: repeat(3, 1fr); } }

        /* Full-width on phone; caps back to a reasonable input width on
           desktop rather than stretching across the whole directory —
           done in CSS (not an inline maxWidth) so mobile stays genuinely
           fluid and only wider viewports get the cap. */
        .pa-search-input { width: 100%; }
        @media (min-width: 640px) { .pa-search-input { max-width: 420px; } }
      `}</style>

      <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0b1e3d", margin: "0 0 1rem" }}>Schools</h1>

      <form method="GET" style={{ marginBottom: "1.25rem" }}>
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search schools by name…"
          className="pa-search-input"
          style={{
            padding: ".65rem .9rem",
            borderRadius: ".6rem", border: "1.5px solid #d1d5db", fontSize: ".95rem",
            boxSizing: "border-box",
          }}
        />
      </form>

      {schools.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: "12px", padding: "2rem 1rem", textAlign: "center", color: "#6b7280" }}>
          {q ? `No schools match "${q}".` : "No schools yet."}
        </div>
      ) : (
        <div className="pa-schools-grid">
          {schools.map(school => (
            <Link key={school.id} href={`/platform-admin/schools/${school.id}`} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: ".5rem", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontSize: "1.02rem", color: "#0b1e3d", flex: "1 1 160px", minWidth: 0, overflowWrap: "break-word" }}>{school.school_name}</div>
                <span
                  style={{
                    fontSize: ".68rem", fontWeight: 700, padding: ".15rem .5rem", borderRadius: "999px",
                    background: school.status === "active" ? "#dcfce7" : "#f3f4f6",
                    color: school.status === "active" ? "#166534" : "#6b7280",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {school.status === "active" ? "Active" : "No active teams"}
                </span>
              </div>

              {(school.city || school.state) && (
                <div style={{ fontSize: ".82rem", color: "#6b7280", marginTop: ".25rem" }}>
                  {[school.city, school.state].filter(Boolean).join(", ")}
                </div>
              )}

              <div style={{ fontSize: ".85rem", color: "#374151", marginTop: ".6rem" }}>
                {school.active_team_count} active team{school.active_team_count === 1 ? "" : "s"}
                {school.total_team_count !== school.active_team_count && (
                  <span style={{ color: "#9ca3af" }}> ({school.total_team_count} total)</span>
                )}
              </div>

              {school.head_coach_name && (
                <div style={{ fontSize: ".82rem", color: "#6b7280", marginTop: ".2rem" }}>
                  Head Coach: {school.head_coach_name}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
