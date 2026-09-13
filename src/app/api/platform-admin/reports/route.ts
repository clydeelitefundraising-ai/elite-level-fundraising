import { NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { getAllReports } from "@/lib/moderation/reports";

export async function GET() {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reports = await getAllReports();
  return NextResponse.json({ reports });
}
