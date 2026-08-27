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
      <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0b1e3d", margin: "0 0 1rem" }}>Schools</h1>

      <form method="GET" style={{ marginBottom: "1.25rem" }}>
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search schools by name…"
          style={{
            width: "100%", maxWidth: 420, padding: ".65rem .9rem",
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
        <div style={{ display: "grid", gap: ".75rem", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {schools.map(school => (
            <Link key={school.id} href={`/platform-admin/schools/${school.id}`} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: ".5rem" }}>
                <div style={{ fontWeight: 700, fontSize: "1.02rem", color: "#0b1e3d" }}>{school.school_name}</div>
                <span
                  style={{
                    fontSize: ".68rem", fontWeight: 700, padding: ".15rem .5rem", borderRadius: "999px",
                    background: school.status === "active" ? "#dcfce7" : "#f3f4f6",
                    color: school.status === "active" ? "#166534" : "#6b7280",
                    whiteSpace: "nowrap",
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
