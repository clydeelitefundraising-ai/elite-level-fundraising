import { getAnnouncements, getTeamFiles } from "@/lib/teamData";
import { getCoachSession } from "@/lib/teamSession";
import UpdatesView from "./UpdatesView";

export const dynamic = "force-dynamic";

export default async function FilesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [updates, files, coach] = await Promise.all([
    getAnnouncements(slug),
    getTeamFiles(slug),
    getCoachSession(slug),
  ]);
  return (
    <UpdatesView
      slug={slug}
      initialUpdates={updates}
      initialFiles={files}
      coach={coach}
    />
  );
}
