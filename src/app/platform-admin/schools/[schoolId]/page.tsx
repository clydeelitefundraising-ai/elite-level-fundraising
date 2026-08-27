import Link from "next/link";
import { notFound } from "next/navigation";
import { getSchoolDetail } from "@/lib/platform/schools";

export const dynamic = "force-dynamic";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function PlatformAdminSchoolDetailPage({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  const school = await getSchoolDetail(schoolId);
  if (!school) notFound();

  return (
    <div>
      <Link href="/platform-admin/schools" style={{ fontSize: ".85rem", color: "#0b1e3d", textDecoration: "none", fontWeight: 600 }}>
        ← Back to Schools
      </Link>

      <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0b1e3d", margin: ".6rem 0 .1rem" }}>{school.school_name}</h1>
      {(school.city || school.state || school.address) && (
        <div style={{ fontSize: ".85rem", color: "#6b7280", marginBottom: "1.25rem" }}>
          {[school.address, school.city, school.state].filter(Boolean).join(", ")}
        </div>
      )}

      {school.teams.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: "12px", padding: "2rem 1rem", textAlign: "center", color: "#6b7280" }}>
          No teams linked to this school yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: ".75rem", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {school.teams.map(team => (
            <Link
              key={team.campaign_slug}
              href={`/team/${team.campaign_slug}/home`}
              style={{
                display: "block", background: "#fff", borderRadius: "12px", padding: "1rem 1.1rem",
                boxShadow: "0 1px 3px rgba(0,0,0,.08)", textDecoration: "none", color: "inherit",
                opacity: team.archived ? 0.65 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: ".5rem" }}>
                <div style={{ fontWeight: 700, fontSize: "1rem", color: "#0b1e3d" }}>{team.sport_name}</div>
                <span
                  style={{
                    fontSize: ".68rem", fontWeight: 700, padding: ".15rem .5rem", borderRadius: "999px",
                    background: team.archived ? "#f3f4f6" : "#dbeafe",
                    color: team.archived ? "#6b7280" : "#1e40af",
                    whiteSpace: "nowrap",
                  }}
                >
                  {team.archived ? "Archived" : (team.status ?? "live")}
                </span>
              </div>
              <div style={{ fontSize: ".82rem", color: "#6b7280", marginTop: ".2rem" }}>{team.season}</div>
              <div style={{ fontSize: ".78rem", color: "#9ca3af", marginTop: ".15rem" }}>/team/{team.campaign_slug}</div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: ".9rem", marginTop: ".7rem", fontSize: ".82rem", color: "#374151" }}>
                <span>Head Coach: {team.head_coach_name ?? "—"}</span>
                <span>{team.athlete_count} athlete{team.athlete_count === 1 ? "" : "s"}</span>
                <span>{formatCents(team.raised_cents)} raised</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
