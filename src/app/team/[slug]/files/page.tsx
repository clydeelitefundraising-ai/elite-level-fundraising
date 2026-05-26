import { getTeamFiles } from "@/lib/teamData";
import { getCoachSession } from "@/lib/teamSession";
import FilesView from "./FilesView";

export default async function FilesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [files, coach] = await Promise.all([
    getTeamFiles(slug),
    getCoachSession(slug),
  ]);
  return <FilesView slug={slug} initialFiles={files} coach={coach} />;
}
