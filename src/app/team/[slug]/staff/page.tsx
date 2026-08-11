import { redirect } from "next/navigation";
import { getTeamActor } from "@/lib/permissions.server";
import { canManageStaff } from "@/lib/permissions";
import StaffView from "./StaffView";

export default async function StaffPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);

  if (actor.kind === "public") redirect("/coach-login");
  if (!canManageStaff(actor)) return <HeadCoachOnlyGate slug={slug} />;

  return <StaffView slug={slug} />;
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
          Team staff management is only available to this team&rsquo;s Head Coach.
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
