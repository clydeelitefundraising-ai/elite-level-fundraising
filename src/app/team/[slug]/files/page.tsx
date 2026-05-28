import { getAnnouncements, getTeamFiles } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import UpdatesView from "./UpdatesView";

export const dynamic = "force-dynamic";

export default async function FilesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [updates, files, actor] = await Promise.all([
    getAnnouncements(slug),
    getTeamFiles(slug),
    getTeamActor(slug),
  ]);
  return (
    <UpdatesView
      slug={slug}
      initialUpdates={updates}
      initialFiles={files}
      actor={actor}
    />
  );
}
