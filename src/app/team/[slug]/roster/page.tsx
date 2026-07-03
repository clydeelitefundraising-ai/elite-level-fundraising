import { redirect } from "next/navigation";

// Roster was renamed to Team. Kept as a redirect for old links/bookmarks.
export default async function RosterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/team/${slug}/team`);
}
