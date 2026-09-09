import { entryPhotoForOffset, ENTRY_PHOTO_OFFSET } from "@/components/auth/entryPhotos";
import ForgotPasswordView from "./ForgotPasswordView";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return <ForgotPasswordView photo={entryPhotoForOffset(ENTRY_PHOTO_OFFSET.forgotPassword)} />;
}
