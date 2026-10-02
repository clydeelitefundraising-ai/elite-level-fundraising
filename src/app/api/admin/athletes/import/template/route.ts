import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// Header-only template — no example row, so a re-upload of the unmodified
// template can never be mistaken for a real athlete.
const TEMPLATE_CSV = "Athlete Name,Class Year,Event\r\n";

export async function GET() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return new NextResponse(TEMPLATE_CSV, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="elf-roster-template.csv"',
    },
  });
}
