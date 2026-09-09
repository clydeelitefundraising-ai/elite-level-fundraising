import { getAccountSession } from "@/lib/accountSession";
import { entryPhotoForOffset, ENTRY_PHOTO_OFFSET } from "@/components/auth/entryPhotos";
import EnterCodeView from "./EnterCodeView";

export const dynamic = "force-dynamic";

export default async function EnterCodePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const [session, params] = await Promise.all([getAccountSession(), searchParams]);
  return (
    <EnterCodeView
      loggedInName={session?.name ?? null}
      initialCode={params.code ?? null}
      photo={entryPhotoForOffset(ENTRY_PHOTO_OFFSET.enterCode)}
    />
  );
}
