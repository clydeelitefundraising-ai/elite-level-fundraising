import { notFound } from "next/navigation";
import { getCampaignSettings } from "@/lib/supabase";
import { getJoinCode, getTeamAthletes } from "@/lib/teamData";
import JoinView from "./JoinView";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  const joinCode = await getJoinCode(upperCode);
  if (!joinCode) {
    return <InvalidCode code={upperCode} />;
  }

  const [settings, athletes] = await Promise.all([
    getCampaignSettings(joinCode.campaign_slug),
    getTeamAthletes(joinCode.campaign_slug),
  ]);

  if (!settings) notFound();

  return (
    <JoinView
      code={upperCode}
      campaignSlug={joinCode.campaign_slug}
      settings={settings}
      athletes={athletes}
    />
  );
}

function InvalidCode({ code }: { code: string }) {
  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0b1e3d",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 380,
        background: "#fff",
        borderRadius: 16,
        padding: "2.25rem 2rem",
        boxShadow: "0 4px 24px rgba(0,0,0,.18)",
        textAlign: "center",
      }}>
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
