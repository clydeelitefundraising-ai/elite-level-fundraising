import { redirect } from "next/navigation";
import { getAccountSession } from "@/lib/accountSession";
import CreateTeamView from "./CreateTeamView";

export const dynamic = "force-dynamic";

// Phase O3. Requires a modern, already-authenticated elf_session account —
// the same authority O2's own POST /api/team-onboarding/create requires —
// and NOTHING else: no existing team membership, no campaign_slug, no
// Platform Admin or legacy shared-password /admin auth. A zero-team
// account reaches this page exactly like any other authenticated account;
// see /teams/page.tsx for the equivalent, already-established shape this
// mirrors (auth gate here, all rendering/interaction in the client view).
export default async function TeamOnboardingPage() {
  const session = await getAccountSession();
  if (!session) redirect("/login");

  return <CreateTeamView accountName={session.name} />;
}
