import { redirect } from "next/navigation";
import { resolveJoinCode } from "@/lib/teamData";

// Compatibility route — Phase 1B made /enter-code the canonical join
// experience. This route still validates the code (so previously
// distributed links, QR codes, and printed materials that pointed here
// keep working) but no longer renders its own join form; it hands off
// straight into the canonical flow, prefilled, so the user lands directly
// on the team-specific step instead of retyping the code.
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  const resolved = await resolveJoinCode(upperCode);
  if (resolved.status === "archived") {
    return <ArchivedTeam />;
  }
  if (resolved.status === "invalid") {
    return <InvalidCode code={upperCode} />;
  }

  redirect(`/enter-code?code=${encodeURIComponent(upperCode)}`);
}

function shellStyle(): React.CSSProperties {
  return {
    minHeight: "100dvh",
    background: "#0b1e3d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1.5rem",
  };
}

function cardStyle(): React.CSSProperties {
  return {
    width: "100%",
    maxWidth: 380,
    background: "#fff",
    borderRadius: 16,
    padding: "2.25rem 2rem",
    boxShadow: "0 4px 24px rgba(0,0,0,.18)",
    textAlign: "center",
  };
}

function InvalidCode({ code }: { code: string }) {
  return (
    <div style={shellStyle()}>
      <div style={cardStyle()}>
        <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>🔗</div>
        <h1 style={{ margin: "0 0 .5rem", fontSize: "1.2rem", fontWeight: 800, color: "#0b1e3d" }}>
          Invalid Join Code
        </h1>
        <p style={{ margin: 0, fontSize: ".875rem", color: "#6b7280", lineHeight: 1.5 }}>
          The code <strong style={{ color: "#374151" }}>{code}</strong> is not valid or has expired.
          Ask your coach for a new link.
        </p>
      </div>
    </div>
  );
}

// Deliberately does not mention "archived" — that's an internal campaign
// state, not something a joining athlete/parent needs to know about.
function ArchivedTeam() {
  return (
    <div style={shellStyle()}>
      <div style={cardStyle()}>
        <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>👋</div>
        <h1 style={{ margin: "0 0 .5rem", fontSize: "1.2rem", fontWeight: 800, color: "#0b1e3d" }}>
          Not Accepting New Members
        </h1>
        <p style={{ margin: 0, fontSize: ".875rem", color: "#6b7280", lineHeight: 1.5 }}>
          This team is no longer accepting new members. Ask your coach for more information.
        </p>
      </div>
    </div>
  );
}
