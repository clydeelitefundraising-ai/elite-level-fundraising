import { redirect } from "next/navigation";
import { getAccountSession } from "@/lib/accountSession";
import { entryPhotoForOffset, ENTRY_PHOTO_OFFSET } from "@/components/auth/entryPhotos";
import SignupView from "./SignupView";

export const dynamic = "force-dynamic";

// Phase O3B — public account-creation entry point. An already-authenticated
// caller (valid elf_session) has nothing to do here — they're sent straight
// to /team-onboarding, same destination a fresh signup lands on afterward,
// rather than being shown the signup form again.
export default async function SignupPage() {
  const session = await getAccountSession();
  if (session) redirect("/team-onboarding");

  return <SignupView photo={entryPhotoForOffset(ENTRY_PHOTO_OFFSET.signup)} />;
}
