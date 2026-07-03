import { redirect } from "next/navigation";

// Updates now lives inside the merged Communications tab (Section 1: Team
// Updates). This route is kept only to gracefully redirect old links/
// bookmarks — UpdatesView.tsx itself still lives here and is imported by
// CommunicationsView.
export default async function FilesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/team/${slug}/communications?tab=updates`);
}
