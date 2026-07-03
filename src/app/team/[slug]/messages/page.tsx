import { redirect } from "next/navigation";

// Messages now lives inside the merged Communications tab (Section 2: Direct
// Messages). This route is kept only to gracefully redirect old links/
// bookmarks — thread detail pages (/messages/[threadId]) are unaffected and
// still live under this folder. MessagesView.tsx itself still lives here and
// is imported by CommunicationsView.
export default async function MessagesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/team/${slug}/communications?tab=messages`);
}
