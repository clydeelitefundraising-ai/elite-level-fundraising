import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getTeamAthletes } from "@/lib/teamData";
import RequestsView from "./RequestsView";
import styles from "./Requests.module.css";

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
    <div className={styles.gateWrap}>
      <div className={styles.gateCard}>
        <Lock size={28} strokeWidth={1.75} className={styles.gateIcon} />
        <div className={styles.gateTitle}>Head Coach Access Only</div>
        <p className={styles.gateBody}>
          The Requests Center is only available to this team&rsquo;s Head Coach.
        </p>
        <a href={`/team/${slug}/home`} className={styles.gateLink}>
          Back to Home
        </a>
      </div>
    </div>
  );
}
