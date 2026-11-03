import { NextResponse } from "next/server";
import { getDemoRequests } from "@/lib/platform/marketingDemoRequests";
import { getAdminAccess, adminUnauthorized } from "@/lib/adminAccess";

export async function GET() {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();

  try {
    const requests = await getDemoRequests();
    return NextResponse.json(requests);
  } catch (err) {
    console.error("[admin/marketing-requests] GET failed:", err);
    return NextResponse.json({ error: "Failed to load marketing demo requests." }, { status: 500 });
  }
}
