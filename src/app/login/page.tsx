import { redirect } from "next/navigation";
import { getAccountSession } from "@/lib/accountSession";
import LoginView from "./LoginView";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getAccountSession();
  if (session) redirect("/teams");
  return <LoginView />;
}
