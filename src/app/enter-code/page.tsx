import { getAccountSession } from "@/lib/accountSession";
import EnterCodeView from "./EnterCodeView";

export const dynamic = "force-dynamic";

export default async function EnterCodePage() {
  const session = await getAccountSession();
  return <EnterCodeView loggedInName={session?.name ?? null} />;
}
