import { redirect } from "next/navigation";
import { getAccountSession } from "@/lib/accountSession";
import ProfileView from "./ProfileView";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session  = await getAccountSession();
  if (!session) redirect("/login");

  return (
    <ProfileView
      slug={slug}
      initialName={session.name}
      email={session.email}
      initialPhotoUrl={session.profile_photo_url}
    />
  );
}
