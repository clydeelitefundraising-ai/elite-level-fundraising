import { redirect } from "next/navigation";

// Roster was renamed to Team. Kept as a redirect for old links/bookmarks.
export default async function RosterAthletePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  redirect(`/team/${slug}/team/${id}`);
}
