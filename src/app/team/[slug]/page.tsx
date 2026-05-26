import { redirect } from "next/navigation";

export default async function TeamRoot({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/team/${slug}/home`);
}
