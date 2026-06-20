import { getAnnouncements, getTeamFiles, getTeamAthletes } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import UpdatesView from "./UpdatesView";

export const dynamic = "force-dynamic";

export default async function FilesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [updates, files, actor, athletes] = await Promise.all([
    getAnnouncements(slug),
    getTeamFiles(slug),
    getTeamActor(slug),
    getTeamAthletes(slug),
  ]);
  return (
    <UpdatesView
      slug={slug}
      initialUpdates={updates}
      initialFiles={files}
      actor={actor}
      athletes={athletes.map(a => ({ id: a.id, name: a.name }))}
    />
  );
}
