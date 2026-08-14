import { redirect } from "next/navigation";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getTeamAthletes } from "@/lib/teamData";
import RequestsView from "./RequestsView";

// Head-Coach-only, same gating pattern as /staff/page.tsx — server-side,
// not just a hidden UI entry point. isHeadCoach(actor) is already scoped to
// THIS campaign (getTeamActor only resolves a "coach" actor from a
// team_coaches row matching both the account and this exact campaign_slug),
// so an Assistant Coach, Booster, athlete, or parent gets the same gate
// regardless of how they arrive at this URL.
export default async function RequestsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);

  if (actor.kind === "public") redirect("/coach-login");
  if (!isHeadCoach(actor)) return <HeadCoachOnlyGate slug={slug} />;

  const rosterAthletes = await getTeamAthletes(slug);
  return <RequestsView slug={slug} rosterAthletes={rosterAthletes} />;
}

function HeadCoachOnlyGate({ slug }: { slug: string }) {
  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <div style={{
        background: "#fff",
        borderRadius: 14,
        padding: "2.5rem 1.5rem",
        textAlign: "center",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      }}>
        <div style={{ fontSize: "2rem", marginBottom: ".65rem", opacity: .35 }}>🔒</div>
        <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0b1e3d", marginBottom: ".3rem" }}>
          Head Coach Access Only
        </div>
        <p style={{ margin: "0 0 1.25rem", fontSize: ".85rem", color: "#6b7280", lineHeight: 1.5 }}>
          The Requests Center is only available to this team&rsquo;s Head Coach.
        </p>
        <a
          href={`/team/${slug}/home`}
          style={{
            display: "inline-block",
            padding: ".55rem 1.25rem",
            background: "#0b1e3d",
            color: "#fff",
            borderRadius: 9,
            fontSize: ".875rem",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Back to Home
        </a>
      </div>
    </div>
  );
}
