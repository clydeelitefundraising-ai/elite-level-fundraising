import { notFound } from "next/navigation";
import { getCampaignSettings } from "@/lib/supabase";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { getThreadsForActor, type ActorKey } from "@/lib/messages";
import MessagesView from "./MessagesView";

export const dynamic = "force-dynamic";

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [settings, actor] = await Promise.all([
    getCampaignSettings(slug),
    getTeamActor(slug),
  ]);
  if (!settings) notFound();

  if (actor.kind === "public") {
    return (
      <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
        <div style={{ fontSize: "2rem", marginBottom: ".75rem", opacity: .35 }}>💬</div>
        <div style={{ fontWeight: 700, color: "#374151", marginBottom: ".35rem" }}>
          Sign in to view messages
        </div>
        <div style={{ fontSize: ".85rem", color: "#9ca3af" }}>
          Messages are private to team members and coaches.
        </div>
      </div>
    );
  }

  const actorKey: ActorKey =
    actor.kind === "coach"
      ? { kind: "coach",  id: actor.session.id }
      : { kind: "member", id: actor.session.id };

  const threads = await getThreadsForActor(slug, actorKey);

  return (
    <MessagesView
      slug={slug}
      initialThreads={threads}
      actorKind={actorKey.kind}
      actorId={actorKey.id}
      actorName={actor.session.name}
      isStaff={isStaff(actor)}
      primaryColor={settings.primary_color}
    />
  );
}
