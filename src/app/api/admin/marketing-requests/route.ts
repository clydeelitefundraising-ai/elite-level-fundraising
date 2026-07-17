import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { getDemoRequests } from "@/lib/platform/marketingDemoRequests";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET() {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const requests = await getDemoRequests();
    return NextResponse.json(requests);
  } catch (err) {
    console.error("[admin/marketing-requests] GET failed:", err);
    return NextResponse.json({ error: "Failed to load marketing demo requests." }, { status: 500 });
  }
}
